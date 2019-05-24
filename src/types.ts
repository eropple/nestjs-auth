export interface IdentityBill {
  grants: ReadonlyArray<string>;

  isIdentified: boolean;
  isAnonymous: boolean;
}

export class IdentifiedBill<TPrincipal, TCredential> implements IdentityBill {
  constructor (
    readonly principal: TPrincipal,
    readonly credential: TCredential,
    readonly grants: ReadonlyArray<string>
  ) {}

  get isIdentified(): true { return true; }
  get isAnonymous(): false { return false; }
}

export class AnonymousBill implements IdentityBill {
  constructor (
    readonly grants: ReadonlyArray<string>
  ) {}

  get isIdentified(): false { return false; }
  get isAnonymous(): true { return true; }
}
