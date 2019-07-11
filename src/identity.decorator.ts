import { createParamDecorator } from '@nestjs/common';

import { IdentifiedExpressRequest } from './helper-types';

// this is not type-safe and relies on the user specifying the correct value of
// `TIdentity` in their parameter, so I see no reason to try to genericize this
// decorator.
export const Identity = createParamDecorator(
  (data, req: IdentifiedExpressRequest) => {
    if (!req.identity) {
      throw new Error(
        'Attempted to fetch an @Identity from a handler not in the nestjs-auth flow.',
      );
    }

    return req.identity;
  },
);
