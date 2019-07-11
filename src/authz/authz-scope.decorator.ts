import { SetMetadata } from '@nestjs/common';

import { AUTHZ_SCOPES } from '../metadata-keys';
import { IdentifiedExpressRequest } from '../helper-types';
import { IdentityBill } from '../types';

export type AuthzScopeArgFn<TIdentity extends IdentityBill = IdentityBill> = (
  req: IdentifiedExpressRequest<TIdentity>,
) => Array<string> | string;
export type AuthzScopeArg<TIdentity extends IdentityBill = IdentityBill> =
  | AuthzScopeArgFn<TIdentity>
  | Array<string>
  | string;

/**
 * Defines a scope (think OAuth2 scope) that `HttpAuthzInterceptor` will
 * check against. If the scope depends on something in the request, such as
 * a URL parameter, you can pass a function that takes the `http` module's
 * `IncomingMessage` and returns either a scope or a list of scopes.
 *
 * If you return a list of scopes, they are _all required_ in order to allow
 * the requestor to access the resource. `@eropple/nestjs-auth` does not and
 * will not provide an "or" function here; that way lies madness.
 *
 * @param scope a scope, a list of scopes, or a function to return the same
 */
export function AuthzScope<TIdentity extends IdentityBill = IdentityBill>(
  scope: AuthzScopeArg<TIdentity>,
) {
  return SetMetadata(AUTHZ_SCOPES, scope);
}
