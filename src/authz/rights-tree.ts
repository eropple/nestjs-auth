import { IdentifiedExpressRequest } from "../helper-types";

export interface RightsTree {
  readonly context?: ((scopePart: string, req: IdentifiedExpressRequest) => any | Promise<any>);
  readonly right?: ((scopePart: string, req: IdentifiedExpressRequest) => boolean | Promise<boolean>);
  readonly children?: { [name: string]: RightsTree };
  readonly wildcard?: RightsTree;
}
