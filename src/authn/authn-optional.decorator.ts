import { SetMetadata } from '@nestjs/common';

import { AUTHN_STATUS } from '../metadata-keys';
import { AuthnStatus } from './authn-status.enum';

/**
 * Handlers decorated with `AuthnOptional` may or may not have a full identity
 * passed to their `@Identity` parameter. If the user _is_ logged in, then the
 * handler receives a full identity: principal, credential, and scopes. If the
 * user is not logged in, then the handler receives an _anonymous_ identity.
 * The principal and credential are undefined; the scopes are whatever you've
 * set as the application's anonymous scopes.
 *
 * Formally, the @Identity parameter should take as a type something that looks
 * like `IdentityBill<TPrincipal, TCredential> | AnonymousBill`.
 */
export const AuthnOptional = () => SetMetadata(AUTHN_STATUS, AuthnStatus.OPTIONAL);
