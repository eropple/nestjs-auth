import { SetMetadata } from '@nestjs/common';

import { AUTHN_STATUS } from '../metadata-keys';
import { AuthnStatus } from './authn-status.enum';

export const AuthnDisallowed = () => SetMetadata(AUTHN_STATUS, AuthnStatus.DISALLOWED);
