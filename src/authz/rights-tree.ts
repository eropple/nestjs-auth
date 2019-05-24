import { DeepReadonly } from "utility-types";
import { IdentifiedExpressRequest } from "../helper-types";

export interface RightsTree {
  readonly context?: ((scopePart: string, req: IdentifiedExpressRequest, locals: { [key: string]: any }) => any | Promise<any>);
  readonly right?: ((scopePart: string, req: IdentifiedExpressRequest, locals: DeepReadonly<{ [key: string]: any }>) => boolean | Promise<boolean>);
  readonly children?: { [name: string]: RightsTree };
  readonly wildcard?: RightsTree;
}
