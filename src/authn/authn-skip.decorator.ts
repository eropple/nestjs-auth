import { SetMetadata } from '@nestjs/common';

import { AUTHN_STATUS } from '../metadata-keys';
import { AuthnStatus } from './authn-status.enum';

/**
 * Handlers decorated with `AuthnSkip` completely skip Authn entirely
 * This is used for things that don't need any authentication checks at all
 *
 * This differs from `AuthOptional` in that if you send _bad_ auth,
 * `AuthOptional` will fail and `AuthnSkip` will succeed
 *
 * Note that contexts are not loaded since we short-circuit, so youyou have to
 * load all contexts manually in the Controller
 */
export const AuthnSkip = () =>
    SetMetadata(AUTHN_STATUS, AuthnStatus.SKIP);
