import { SetMetadata } from '@nestjs/common';

import { AUTHN_STATUS } from '../metadata-keys';
import { AuthnStatus } from './authn-status.enum';

/**
 * Please remember that, by default, `AuthnRequired` is not necessary. It is
 * implied on _all_ handlers. This just exists so that one can apply something
 * like `AuthnOptional` at the controller level but undo it at a lower level.
 *
 * You shouldn't do this regularly, but sometimes it makes your code easier to
 * read.
 */
export const AuthnRequired = () =>
  SetMetadata(AUTHN_STATUS, AuthnStatus.REQUIRED);
