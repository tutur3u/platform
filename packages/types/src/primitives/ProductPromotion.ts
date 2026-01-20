import type { Entity } from './Entity';

export interface ProductPromotion extends Entity {
  description?: string;
  code?: string;
  value: number | string;
  use_ratio: boolean;
  /**
   * Global usage limit across all customers.
   * NULL/undefined = unlimited.
   */
  max_uses?: number | null;
  /**
   * Current total times this promotion has been used.
   */
  current_uses?: number;
  ws_id?: string;
  promo_type: 'REGULAR' | 'REFERRAL';
}
