import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { describe, expect, it } from 'vitest';
import {
  buildPromotionPayload,
  emptyPromotionForm,
  isPromotionFormValid,
  promotionFormFromRow,
} from './promotion-form';

describe('isPromotionFormValid', () => {
  it('requires a name and code', () => {
    expect(isPromotionFormValid(emptyPromotionForm())).toBe(false);
    expect(
      isPromotionFormValid({
        ...emptyPromotionForm(),
        code: 'SAVE10',
        name: 'Launch',
        value: '10',
      })
    ).toBe(true);
  });

  it('rejects percentage values above 100', () => {
    expect(
      isPromotionFormValid({
        ...emptyPromotionForm(),
        code: 'X',
        name: 'X',
        unit: 'percentage',
        value: '150',
      })
    ).toBe(false);
    expect(
      isPromotionFormValid({
        ...emptyPromotionForm(),
        code: 'X',
        name: 'X',
        unit: 'currency',
        value: '150',
      })
    ).toBe(true);
  });
});

describe('buildPromotionPayload', () => {
  it('trims fields and treats blank max uses as unlimited', () => {
    expect(
      buildPromotionPayload({
        code: '  SAVE10 ',
        description: '  ',
        maxUses: '',
        name: '  Launch ',
        unit: 'percentage',
        value: '10',
      })
    ).toEqual({
      code: 'SAVE10',
      description: undefined,
      max_uses: null,
      name: 'Launch',
      unit: 'percentage',
      value: 10,
    });
  });

  it('keeps a numeric max uses cap', () => {
    expect(
      buildPromotionPayload({
        ...emptyPromotionForm(),
        code: 'A',
        maxUses: '25',
        name: 'A',
        value: '5',
      }).max_uses
    ).toBe(25);
  });
});

describe('promotionFormFromRow', () => {
  it('maps use_ratio to the percentage/currency unit', () => {
    const row = {
      code: 'VIP',
      id: 'p1',
      max_uses: 5,
      name: 'VIP',
      promo_type: 'REGULAR',
      use_ratio: false,
      value: 20,
    } as ProductPromotion;

    expect(promotionFormFromRow(row)).toMatchObject({
      code: 'VIP',
      maxUses: '5',
      unit: 'currency',
      value: '20',
    });
  });
});
