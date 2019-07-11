import * as Bunyan from 'bunyan';
import { Request as ExpressRequest } from 'express';

import { IdentifiedBillBase } from '../types';
import { StringTo } from '../helper-types';

export type PrincipalFnRet<TIdentifiedBill extends IdentifiedBillBase> =
  | TIdentifiedBill
  | null
  | false;

export type PrincipalFn<TIdentifiedBill extends IdentifiedBillBase> = (
  headers: StringTo<string | Array<string> | undefined>,
  cookies: StringTo<string>,
  request: ExpressRequest,
) => PrincipalFnRet<TIdentifiedBill> | Promise<PrincipalFnRet<TIdentifiedBill>>;

export interface HttpAuthnOptions<TIdentifiedBill extends IdentifiedBillBase> {
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
  principalFn: PrincipalFn<TIdentifiedBill>;

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
