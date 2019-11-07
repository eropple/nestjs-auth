import { AUTHZ_SCOPES } from '../metadata-keys';
import { IdentifiedExpressRequest } from '../helper-types';
import { IdentityBill, AnyCtor } from '../types';
import { AppendArrayMetadata, getAllMetadata, getAllPropertyMetadata } from '../metadata';

export type AuthzScopeArgFn<TIdentity extends IdentityBill = IdentityBill> = (
  req: IdentifiedExpressRequest<TIdentity>,
) => Array<string> | string;
export type AuthzScopeArg<TIdentity extends IdentityBill = IdentityBill> =
  | AuthzScopeArgFn<TIdentity>
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
  scope: AuthzScopeArg<TIdentity> | Array<AuthzScopeArg<TIdentity>>,
) {
  return AppendArrayMetadata(AUTHZ_SCOPES, scope);
}

/**
 * Points at another HTTP handler, already decorated with `AuthzScope`, that
 * should be a reference for scopes for this endpoint. It is important to note
 * that these will be a union of any other scopes attached to this endpoint,
 * _not_ a subset/intersection/etcetera. It is used primarily to make sure that
 * controllers that are logical supersets of other controllers can adopt the
 * permission structure for the controllers that they otherwise encapsulate
 * (when doing complex operations, etc.).
 *
 * This decorator can be stacked, and multiple copies of it can be added to the
 * same handler.
 */
export function AuthzAdoptScopesFrom<T extends AnyCtor<any>, TIdentity extends IdentityBill = IdentityBill>(
  target: T,
  propertyKey: keyof T['prototype'],
): any {
  const allMetadata = getAllPropertyMetadata(target.prototype, String(propertyKey));
  const adoptedScopes: Array<AuthzScopeArg<TIdentity>> | undefined = allMetadata[AUTHZ_SCOPES];

  if (!adoptedScopes) {
    throw new Error(`Attempted to adopt scopes from target '${target}', but none found: ${JSON.stringify(allMetadata)}.`);
  }

  return AppendArrayMetadata(AUTHZ_SCOPES, adoptedScopes);
}
