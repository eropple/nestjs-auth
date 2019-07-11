import { Request as ExpressRequest } from 'express';

import { IdentityBill } from './types';

// tslint:disable-next-line: interface-over-type-literal
export type StringTo<T> = { [key: string]: T };
// tslint:disable-next-line: interface-over-type-literal
export type IdentityTag<TIdentity extends IdentityBill = IdentityBill> = {
  identity: TIdentity;
};

export type ExpressRequestWithLocals = ExpressRequest & {
  locals: StringTo<any>;
};
export type IdentifiedExpressRequest<
  TIdentity extends IdentityBill = IdentityBill
> = ExpressRequestWithLocals & IdentityTag<TIdentity>;
