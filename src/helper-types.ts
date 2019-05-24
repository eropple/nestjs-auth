import { Request as ExpressRequest } from "express";

import { IdentityBill } from "./types";

export type StringTo<T> = { [key: string]: T };
export type IdentityTag = { identity: IdentityBill };
export type IdentifiedExpressRequest = ExpressRequest & IdentityTag;
