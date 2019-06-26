import * as Bunyan from "bunyan";
import bunyanBlackHole from "bunyan-blackhole";
import { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import { ServerResponse } from 'http';
import { Observable } from 'rxjs';
import { parse as cookieParse } from "cookie";
import { Request as ExpressRequest } from "express";


import { IdentifiedBill, IdentityBill, AnonymousBill, IdentifiedBillBase } from '../types';
import { StringTo, IdentifiedExpressRequest } from '../helper-types';
import { AuthnStatus } from './authn-status.enum';
import { AUTHN_STATUS } from '../metadata-keys';
import { observableResponse } from "../util";

export type PrincipalFnRet<
  TIdentifiedBill extends IdentifiedBillBase
> =
  TIdentifiedBill |
  null |
  false;

export type PrincipalFn<TIdentifiedBill extends IdentifiedBillBase> =
(headers: StringTo<string | string[] | undefined>, cookies: StringTo<string>, request: ExpressRequest) =>
  PrincipalFnRet<TIdentifiedBill> | Promise<PrincipalFnRet<TIdentifiedBill>>

export interface HttpAuthnOptions<
  TIdentifiedBill extends IdentifiedBillBase
> {
  /**
   * The function that `nestjs-auth` should use to determine a principal from
   * a request. This might be a session token lookup, decoding a JWT (but please
   * consider PASETO instead!), or some other method of extracting an identity
   * from the request.
   *
   * The return values may be any of the following (or a `Promise` of the same):
   *
   * -  An `IdentityBill` containing a principal that your application can
   *    understand, a reference to your credentials, and a set of authorization
   *    scopes. If your application doesn't yet use scopes, you should return
   *    `[**\/*]` as your scope set. (For details as to why, check the readme.)
   * -  `null` if the request has no login. When you use handlers that are
   *    decorated with `@AuthnOptional()`, the request will be provided the
   *    scopes that you provide in `anonymousScopes`.
   * -  `false` if the request should be rejected immediately. This should be
   *    reserved for when you have determined that a set of credentials is
   *    _invalid_ (as opposed to _nonexistent_), such as when a user attempts
   *    to use an expired session token.
   */
  principalFn: PrincipalFn<TIdentifiedBill>

  /**
   * The set of scopes to grant to an anonymous identity.
   */
  anonymousScopes: ReadonlyArray<string>;

  /**
   * An optional logger that will provide detailed introspection into the
   * behavior of the interceptor.
   */
  logger?: Bunyan;
}

/**
 * The authentication layer of `@eropple/nestjs-auth`. This takes a user-defined
 * function (see `HttpAuthnOptions`) and determines from it the current state of
 * the requestor's identity. It then uses the `@AuthnXXX()` family of decorators
 * (`@AuthnRequired()`, `@AuthnOptional()`, and `@AuthnDisallowed()`) to decide
 * whether or not to return a 401 Unauthorized to the requestor or to pass the
 * request on down the chain.
 */
export class HttpAuthnInterceptor<
  TIdentifiedBill extends IdentifiedBillBase
> implements NestInterceptor {
  private readonly _logger: Bunyan;

  constructor(
    private readonly _options: HttpAuthnOptions<TIdentifiedBill>
  ) {
    this._logger = this._options.logger || bunyanBlackHole("HttpAuthzInterceptor");
  }

  private async _doAuthn(request: ExpressRequest): Promise<PrincipalFnRet<TIdentifiedBill>> {
    const headers = request.headers;
    const cookies = cookieParse(headers["cookie"] || "");

    return this._options.principalFn(headers, cookies, request);
  }

  private _unauthorized(response: ServerResponse): Observable<any> {
    return observableResponse(response, { error: "Unauthorized." }, 401);
  }

  private _buildIdentity(authn: PrincipalFnRet<TIdentifiedBill>) {
    if (authn instanceof IdentifiedBill) {
      // anonymous; create an anonymous identity bill
      return authn;
    } else {
      // identified; we already _have_ an identity bill returned to us
      return new AnonymousBill(this._options.anonymousScopes);
    }
  }

  private _shortCircuitBadAuth(identity: IdentityBill, controller: Type<any>, handler: Function): boolean {
    const status: AuthnStatus =
      Reflect.getMetadata(AUTHN_STATUS, handler) ||
      Reflect.getMetadata(AUTHN_STATUS, controller) ||
      AuthnStatus.REQUIRED;

    switch (status) {
      case AuthnStatus.REQUIRED:
        return identity.isIdentified;
      case AuthnStatus.DISALLOWED:
        return identity.isAnonymous;
      case AuthnStatus.OPTIONAL:
        return true; // doesn't matter
      default:
        throw new Error(`Bad AuthnStatus value (are you not in TypeScript?): ${status}`);
    }
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request: IdentifiedExpressRequest = context.switchToHttp().getRequest();
    const response: ServerResponse = context.switchToHttp().getResponse();
    const controller = context.getClass();
    const handler = context.getHandler();

    const authn = await this._doAuthn(request);

    // we should reject the request's credentials as invalid
    if (authn === false) {
      return this._unauthorized(response);
    } else {
      // we have a _potentially_ valid request; is it anonymous or identified?
      request.identity = this._buildIdentity(authn);

      if (this._shortCircuitBadAuth(request.identity, controller, handler)) {
          return next.handle();
      } else {
        return this._unauthorized(response);
      }
    }
  }
}
