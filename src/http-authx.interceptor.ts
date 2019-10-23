import * as Bunyan from 'bunyan';
import bunyanBlackHole from 'bunyan-blackhole';
import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  Type,
  flatten,
} from '@nestjs/common';
import { ServerResponse } from 'http';
import { Observable } from 'rxjs';
import { parse as cookieParse } from 'cookie';
import { Request as ExpressRequest } from 'express';

import {
  IdentifiedBill,
  IdentityBill,
  AnonymousBill,
  IdentifiedBillBase,
} from './types';
import { StringTo, IdentifiedExpressRequest } from './helper-types';
import { AuthnStatus } from './authn/authn-status.enum';
import { AUTHN_STATUS, AUTHZ_SCOPES } from './metadata-keys';
import { observableResponse } from './util';
import { HttpAuthnOptions, PrincipalFnRet } from './authn/options';
import { HttpAuthzOptions } from './authz/options';
import { RightsTree } from './authz/rights-tree';
import { AuthzScopeArg, AuthzScopeArgFn } from './authz/authz-scope.decorator';

// TODO: create a types library for nanomatch
// tslint:disable-next-line: no-var-requires
const nanomatch = require('nanomatch');

export interface HttpAuthxOptions<
  TIdentity extends IdentityBill,
  TIdentifiedBill extends IdentifiedBillBase
  > {
  /**
   * An optional logger that will provide detailed introspection into the
   * behavior of the interceptor.
   */
  logger?: Bunyan;

  /**
   * Authentication-specific settings.
   */
  authn: HttpAuthnOptions<TIdentifiedBill>;
  /**
   * Authorization-specific settings.
   */
  authz: HttpAuthzOptions<TIdentity>;

  /**
   * Creator for the response body provided when a 403 Forbidden is being sent.
   * Useful for integrating with something like `@eropple/nestjs-openapi3` in
   * order to send back typed errors.
   */
  forbiddenResponse?: (
    request: ExpressRequest,
    response: ServerResponse,
    scopes: ReadonlyArray<string>,
  ) => StringTo<any>;

  /**
   * Creator for the response body provided when a 401 Unauthorized is being
   * sent. Useful for integrating with something like `@eropple/nestjs-openapi3`
   * in order to send back typed errors.
   */
  unauthorizedResponse?: (
    request: ExpressRequest,
    response: ServerResponse,
  ) => StringTo<any>;
}

/**
 * The combined authentication layer of `@eropple/nestjs-auth`.
 *
 * For authentication (formerly `HttpAuthnInterceptor`), this takes a
 * user-defined function (see `HttpAuthnOptions`) and determines from it the
 * current state of the requestor's identity. It then uses the `@AuthnXXX()`
 * family of decorators (`@AuthnRequired()`, `@AuthnOptional()`, `@AuthnSkip()` and
 * `@AuthnDisallowed()`) to decide whether or not to return a 401 Unauthorized
 * to the requestor or to pass the request on down the chain.
 *
 * For authorization (formerly `HttpAuthzInterceptor`): nestjs-auth functionally
 * operates on the notion of scopes, as per OAuth2 (not that it's the _best_ way
 * to do this, but it's the most common way you see it in the wild). These
 * scopes are just a list of strings (there's an implicit "and" for these
 * scopes).
 *
 * **Something to pay attention to:** unlike some other implementations of
 * OAuth2 scopes, we use the forward slash character, `/`, as a separator to
 * indicate hierarchy. This is because we use file-style globbing to match the
 * handler's specified scopes against the grants in the identity. Check the
 * documentation for details.
 */
export class HttpAuthxInterceptor<
  TIdentityBill extends IdentityBill,
  TIdentifiedBill extends IdentifiedBillBase
  > implements NestInterceptor {
  private readonly logger: Bunyan;
  private readonly tree: RightsTree<
    TIdentityBill,
    IdentifiedExpressRequest<TIdentityBill>
  >;

  constructor(
    private readonly options: HttpAuthxOptions<TIdentityBill, TIdentifiedBill>,
  ) {
    this.logger =
      this.options.logger || bunyanBlackHole('HttpAuthxInterceptor');
    this.tree = this.options.authz.tree;
  }

  //#region authn
  private _unauthorized(
    request: ExpressRequest,
    response: ServerResponse,
  ): Observable<any> {
    const body =
      this.options.unauthorizedResponse
        ? this.options.unauthorizedResponse(request, response)
        : { error: 'Forbidden.' };
    return observableResponse(response, body, 401);
  }

  private async _doAuthn(
    request: ExpressRequest,
  ): Promise<PrincipalFnRet<TIdentifiedBill>> {
    const headers = request.headers;
    const cookies = cookieParse(headers.cookie || '');

    return this.options.authn.principalFn(headers, cookies, request);
  }

  private _buildIdentity(authn: PrincipalFnRet<TIdentifiedBill>) {
    if (authn instanceof IdentifiedBill) {
      // anonymous; create an anonymous identity bill
      return authn as TIdentifiedBill;
    } else {
      // identified; we already _have_ an identity bill returned to us
      return new AnonymousBill(this.options.authn.anonymousScopes);
    }
  }

  private _shortCircuitBadAuth(
    identity: IdentityBill,
    status: AuthnStatus,
  ): boolean {
    switch (status) {
      case AuthnStatus.REQUIRED:
        return identity.isIdentified;
      case AuthnStatus.DISALLOWED:
        return identity.isAnonymous;
      case AuthnStatus.OPTIONAL:
        return true; // doesn't matter
      case AuthnStatus.SKIP:
        return true; // doesn't matter
      default:
        throw new Error(
          `Bad AuthnStatus value (are you not in TypeScript?): ${status}`,
        );
    }
  }
  //#endregion authn

  //#region authz
  private _forbidden(
    request: ExpressRequest,
    response: ServerResponse,
    scopes: ReadonlyArray<string>,
  ): Observable<any> {
    const body =
      this.options.forbiddenResponse
        ? this.options.forbiddenResponse(request, response, scopes)
        : { error: 'Forbidden.' };
    return observableResponse(response, body, 403);
  }

  private _getScopes(
    request: IdentifiedExpressRequest<TIdentityBill>,
    // we get this from NestJS/rxjs
    // tslint:disable-next-line: ban-types
    handler: Function,
  ): ReadonlyArray<string> {
    const scopesArg: AuthzScopeArg | undefined = Reflect.getMetadata(
      AUTHZ_SCOPES,
      handler,
    );
    if (!scopesArg) {
      throw new Error(
        `Handler for request '${request.url}' does not have @AuthzScope().`,
      );
    }

    let scopes: Array<string> | string;

    if (typeof scopesArg !== 'function') {
      scopes = scopesArg;
    } else {
      scopes = (scopesArg as AuthzScopeArgFn)(request);
    }

    return flatten([scopes]);
  }

  private _validateScopesAgainstGrants(
    scopes: ReadonlyArray<string>,
    grants: ReadonlyArray<string>,
  ): boolean {
    return nanomatch(scopes, grants).length === scopes.length;
  }

  private async _validateScopeAgainstRights(
    request: IdentifiedExpressRequest<TIdentityBill>,
    scope: string,
  ): Promise<boolean> {
    const scopeParts = scope.split('/');
    const nodeName = '[ROOT]';
    let node: RightsTree<
      TIdentityBill,
      IdentifiedExpressRequest<TIdentityBill>
    > = this.tree;
    const locals: { [key: string]: any } = {};
    request.locals = locals;

    if (this.tree.context) {
      this.logger.trace('Running root node\'s context.');
      this.tree.context('[ROOT]', request);
    }

    for (const scopePart of scopeParts) {
      this.logger.debug(`Testing node '${scopePart}'.`);
      let nextNode:
        | RightsTree<TIdentityBill, IdentifiedExpressRequest<TIdentityBill>>
        | undefined;

      if (node.children) {
        nextNode = node.children[scopePart];
      }
      nextNode = nextNode || node.wildcard;

      if (!nextNode) {
        throw new Error(
          `When testing scope '${scope}', could not find scope part '${scopePart}' in rights tree. No wildcard exists, so we are failing.`,
        );
      }

      if (nextNode.context) {
        this.logger.debug('Has context; evaluating.');
        const contextRet = await nextNode.context(scopePart, request);
        if (contextRet === false) {
          this.logger.debug('Context returned false, failing on scope.');
          return false;
        }
      }

      node = nextNode;
    }

    if (!node!.right) {
      throw new Error(
        `Scope '${scope}' is using node '${nodeName}' as a terminal node, but it has no rights function.`,
      );
    }

    return await node!.right(scopeParts[scopeParts.length - 1], request);
  }

  private async _validateScopesAgainstRights(
    request: IdentifiedExpressRequest<TIdentityBill>,
    scopes: ReadonlyArray<string>,
  ): Promise<boolean> {
    const rets = await Promise.all(
      scopes.map(s => this._validateScopeAgainstRights(request, s)),
    );

    return rets.every(ret => ret);
  }
  //#endregion authz

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request: IdentifiedExpressRequest<
      TIdentityBill
    > = context.switchToHttp().getRequest();
    const response: ServerResponse = context.switchToHttp().getResponse();
    const controller = context.getClass();
    const handler = context.getHandler();
    const status: AuthnStatus =
      Reflect.getMetadata(AUTHN_STATUS, handler) ||
      Reflect.getMetadata(AUTHN_STATUS, controller) ||
      AuthnStatus.REQUIRED;

    if (status === AuthnStatus.SKIP) {
      // Skip auth checks entirely
      return next.handle();
    }

    // BEGINNING AUTHN STEP
    const authn = await this._doAuthn(request);

    // we should reject the request's credentials as invalid
    if (authn === false) {
      return this._unauthorized(request, response);
    } else {
      // we have a _potentially_ valid request; is it anonymous or identified?
      // (this confuses the typechecker but it is correct in practice)
      (request.identity as any) = this._buildIdentity(authn);

      if (!this._shortCircuitBadAuth(request.identity, status)) {
        return this._unauthorized(request, response);
      }
    }

    // AUTHN COMPLETED, BEGINNING AUTHZ STEP
    const scopes = this._getScopes(request, handler);
    const grants = request.identity.grants;

    const scopesAgainstGrants = this._validateScopesAgainstGrants(
      scopes,
      grants,
    );
    if (!scopesAgainstGrants) {
      this.logger.debug({ scopes, grants }, 'Request failed to validate scopes against grants.');
      return this._forbidden(request, response, scopes);
    }

    const scopesAgainstRights = await this._validateScopesAgainstRights(
      request,
      scopes,
    );
    if (!scopesAgainstRights) {
      this.logger.debug({ scopes, grants }, 'Request failed to validate scopes against rights.');
      return this._forbidden(request, response, scopes);
    }

    // SUCCESSFULLY COMPLETED, LET'S DO AN APP THING
    return next.handle();
  }
}
