import { fireEvent, render, screen, within } from '@testing-library/react';
import { COMPARISON_FEATURES } from '@tuturuuu/utils/commercial-comparison';
import { describe, expect, it } from 'vitest';
import en from '../../../../../apps/web/messages/en.json';
import vi from '../../../../../apps/web/messages/vi.json';
import { CommercialComparison } from './commercial-comparison';

describe('commercial comparison', () => {
  it('filters by app and resets an empty search', () => {
    render(<CommercialComparison copy={en.commercialComparison} />);
    fireEvent.change(screen.getByLabelText('App'), {
      target: { value: 'drive' },
    });
    expect(
      screen.getByText(
        `${COMPARISON_FEATURES.filter((row) => row.app === 'drive' && row.category !== 'internal').length} matching features`
      )
    ).toBeTruthy();
    fireEvent.change(
      screen.getByPlaceholderText(en.commercialComparison.search),
      { target: { value: 'no-matching-feature' } }
    );
    expect(screen.getByText(en.commercialComparison.empty)).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Reset filters' })[0]!
    );
    expect(
      screen.getByText(
        `${COMPARISON_FEATURES.filter((row) => row.category !== 'internal').length} matching features`
      )
    ).toBeTruthy();
  });
  it('searches displayed capacity values', () => {
    render(<CommercialComparison copy={en.commercialComparison} />);
    fireEvent.change(
      screen.getByPlaceholderText(en.commercialComparison.search),
      { target: { value: '20 GiB' } }
    );
    expect(screen.queryByText(en.commercialComparison.empty)).toBeNull();
  });
  it('compares only selected tiers and keeps at least one visible', () => {
    render(<CommercialComparison copy={en.commercialComparison} />);
    const controls = screen.getByRole('group', { name: 'Tiers to compare' });
    for (const name of ['Free', 'Plus', 'Enterprise'])
      fireEvent.click(within(controls).getByRole('button', { name }));
    expect(
      within(controls).getByRole('button', { name: 'Pro' })
    ).toBeDisabled();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  });
  it('exposes explanations on touch and searches Vietnamese without accents', () => {
    render(<CommercialComparison copy={vi.commercialComparison} />);
    fireEvent.change(
      screen.getByPlaceholderText(vi.commercialComparison.search),
      { target: { value: 'tin dung AI' } }
    );
    expect(screen.getByText('Tín dụng AI hằng tháng')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(vi.commercialComparison.details));
    expect(
      screen.getAllByText(vi.commercialComparison.explanations.aiAllowance)
        .length
    ).toBeGreaterThan(0);
  });
  it('matches Vietnamese crossed d in unaccented search', () => {
    render(<CommercialComparison copy={vi.commercialComparison} />);
    fireEvent.change(
      screen.getByPlaceholderText(vi.commercialComparison.search),
      { target: { value: 'dong thoi' } }
    );
    expect(
      screen.getByText(vi.commercialComparison.features.board)
    ).toBeTruthy();
  });
});
