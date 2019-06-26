import { Request as ExpressRequest } from "express";

import { IdentityBill } from "./types";


export type StringTo<T> = { [key: string]: T };
export type IdentityTag<
  TIdentity extends IdentityBill = IdentityBill
> = { identity: TIdentity };

export type ExpressRequestWithLocals = ExpressRequest & { locals: StringTo<any> };
export type IdentifiedExpressRequest<
  TIdentity extends IdentityBill = IdentityBill
> = ExpressRequestWithLocals & IdentityTag<TIdentity>;
