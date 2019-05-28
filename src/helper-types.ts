import { Request as ExpressRequest } from "express";

import { IdentityBill } from "./types";


export type StringTo<T> = { [key: string]: T };
export type IdentityTag = { identity: IdentityBill };

export type ExpressRequestWithLocals = ExpressRequest & { locals: StringTo<any> };
export type IdentifiedExpressRequest = ExpressRequestWithLocals & IdentityTag;
