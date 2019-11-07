// tslint:disable: max-classes-per-file
export interface AnyCtor<T> {
  new(...args: Array<any>): T;
  prototype: {};
}

export interface IdentityBill {
  grants: ReadonlyArray<string>;

  isIdentified: boolean;
  isAnonymous: boolean;
}

export abstract class IdentifiedBillBase {
  constructor(readonly grants: ReadonlyArray<string>) {}

  get isIdentified(): true {
    return true;
  }
  get isAnonymous(): false {
    return false;
  }
}

export class IdentifiedBill<
  TPrincipal,
  TCredential
> extends IdentifiedBillBase {
  constructor(
    readonly principal: TPrincipal,
    readonly credential: TCredential,
    grants: ReadonlyArray<string>,
  ) {
    super(grants);
  }
}

export class AnonymousBill implements IdentityBill {
  constructor(readonly grants: ReadonlyArray<string>) {}

  get isIdentified(): false {
    return false;
  }
  get isAnonymous(): true {
    return true;
  }
}
