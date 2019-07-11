import { IdentityBill } from '../types';
import { RightsTree } from './rights-tree';
import { IdentifiedExpressRequest } from '../helper-types';

export interface HttpAuthzOptions<TIdentity extends IdentityBill> {
  /**
   * The application's rights tree, used to determine whether a scope included
   * in an identity's grant is actually valid for that identity to grant in the
   * first place.
   */
  tree: RightsTree<TIdentity, IdentifiedExpressRequest<TIdentity>>;
}
