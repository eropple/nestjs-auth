import { createParamDecorator } from "@nestjs/common";

import { IdentifiedExpressRequest } from "./helper-types";

export const Identity = createParamDecorator((_data, req: IdentifiedExpressRequest) => {
  if (!req.identity) {
    throw new Error("Attempted to fetch an @Identity from a handler not in the nestjs-auth flow.");
  }

  return req.identity;
});
