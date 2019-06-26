import * as Bunyan from "bunyan";
import bunyanBlackHole from "bunyan-blackhole";
import { CallHandler, ExecutionContext, NestInterceptor, flatten } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ServerResponse } from 'http';

import { AUTHZ_SCOPES } from '../metadata-keys';
import { IdentityBill } from '../types';
import { RightsTree } from './rights-tree';
import { IdentifiedExpressRequest } from '../helper-types';
import { AuthzScopeArg, AuthzScopeArgFn } from './authz-scope.decorator';
import { observableResponse } from "../util";

// TODO: create a types library for nanomatch
const nanomatch = require("nanomatch");

export interface HttpAuthzOptions<
  TIdentity extends IdentityBill
> {
  /**
   * The application's rights tree, used to determine whether a scope included
   * in an identity's grant is actually valid for that identity to grant in the
   * first place.
   */
  tree: RightsTree<TIdentity, IdentifiedExpressRequest<TIdentity>>;

  /**
   * An optional logger that will provide detailed introspection into the
   * behavior of the interceptor.
   */
  logger?: Bunyan;
}

/**
 * The authorization layer of `@eropple/nestjs-auth`.
 *
 * This module functionally operators on the notion of scopes, as per OAuth2
 * (not that it's the _best_ way to do this, but it's the most common way you
 * see it in the wild). These scopes are just a list of strings (there's an
 * implicit "and" for these scopes).
 *
 * **Something to pay attention to:** unlike some other implementations of
 * OAuth2 scopes, we use the forward slash character, `/`, as a separator to
 * indicate hierarchy. This is because we use file-style globbing to match the
 * handler's specified OAuth2 scopes against the scopes in the identity. Check
 * the documentation for details.
 */
export class HttpAuthzInterceptor<
  // TODO: in 0.3.0, this should not have a default.
  TIdentity extends IdentityBill = IdentityBill
> implements NestInterceptor {
  private readonly _tree: RightsTree<TIdentity, IdentifiedExpressRequest<TIdentity>>;
  private readonly _logger: Bunyan;

  constructor(
    private readonly _options: HttpAuthzOptions<TIdentity>
  ) {
    this._tree = this._options.tree;
    this._logger = this._options.logger || bunyanBlackHole("HttpAuthzInterceptor");
  }

  private _forbidden(response: ServerResponse): Observable<any> {
    return observableResponse(response, { error: "Forbidden." }, 403);
  }

  private _getScopes(request: IdentifiedExpressRequest<TIdentity>, handler: Function): ReadonlyArray<string> {
    const scopesArg: AuthzScopeArg | undefined = Reflect.getMetadata(AUTHZ_SCOPES, handler);
    if (!scopesArg) {
      throw new Error(`Handler for request '${request.url}' does not have @AuthzScope().`);
    }

    let scopes: Array<string> | string;

    if (typeof(scopesArg) !== "function") {
      scopes = scopesArg;
    } else {
      scopes = (scopesArg as AuthzScopeArgFn)(request);
    }

    return flatten([scopes]);
  }

  private _validateScopesAgainstGrants(scopes: ReadonlyArray<string>, grants: ReadonlyArray<string>): boolean {
    return (nanomatch(scopes, grants).length === scopes.length);
  }

  private async _validateScopeAgainstRights(request: IdentifiedExpressRequest<TIdentity>, scope: string): Promise<boolean> {
    const scopeParts = scope.split("/");
    let nodeName = "[ROOT]";
    let node: RightsTree<TIdentity, IdentifiedExpressRequest<TIdentity>> = this._tree;
    const locals: { [key: string]: any } = {};
    request.locals = locals;

    if (this._tree.context) {
      this._logger.trace("Running root node's context.");
      this._tree.context("[ROOT]", request);
    }

    for (let scopePart of scopeParts) {
      this._logger.debug(`Testing node '${scopePart}'.`);
      let nextNode: RightsTree<TIdentity, IdentifiedExpressRequest<TIdentity>> | undefined = undefined;

      if (node.children) {
        nextNode = node.children[scopePart];
      }
      nextNode = nextNode || node.wildcard;

      if (!nextNode) {
        throw new Error(`When testing scope '${scope}', could not find scope part '${scopePart}' in rights tree. No wildcard exists, so we are failing.`);
      }

      if (nextNode.context) {
        this._logger.debug("Has context; evaluating.");
        const contextRet = await nextNode.context(scopePart, request);
        if (contextRet === false) {
          this._logger.debug("Context returned false, failing on scope.");
          return false;
        }
      }

      node = nextNode;
    }

    if (!(node!.right)) {
      throw new Error(`Scope '${scope}' is using node '${nodeName}' as a terminal node, but it has no rights function.`);
    }

    return (await node!.right(scopeParts[scopeParts.length - 1], request));
  }

  private async _validateScopesAgainstRights(request: IdentifiedExpressRequest<TIdentity>, scopes: ReadonlyArray<string>): Promise<boolean> {
    const rets = await Promise.all(scopes.map(s => this._validateScopeAgainstRights(request, s)));

    return rets.every(ret => ret);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request: IdentifiedExpressRequest<TIdentity> = context.switchToHttp().getRequest();
    const identity: IdentityBill = request.identity;
    const response: ServerResponse = context.switchToHttp().getResponse();
    const handler = context.getHandler();

    const scopes = this._getScopes(request, handler);
    const grants = identity.grants;

    const scopesAgainstGrants = this._validateScopesAgainstGrants(scopes, grants);
    if (!scopesAgainstGrants) {
      this._logger.debug("Request failed to validate scopes against grants.");
      return this._forbidden(response);
    }

    const scopesAgainstRights = await this._validateScopesAgainstRights(request, scopes);
    if (!scopesAgainstRights) {
      this._logger.debug("Request failed to validate scopes against rights.");
      return this._forbidden(response);
    }

    return next.handle();
  }
}
