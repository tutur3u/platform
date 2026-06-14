import { render, screen } from '@testing-library/react';
import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { StorefrontSurface } from './storefront-surface';
import { sanitizeStorefrontAccentColor } from './utils';

const storefront: InventoryStorefront = {
  accentColor: '#abc',
  analyticsEnabled: true,
  cornerStyle: 'rounded',
  coverImageUrl: null,
  createdAt: '2026-06-12T00:00:00.000Z',
  currency: 'USD',
  checkoutMode: 'polar',
  description: 'Buyer-facing copy',
  heroImageUrl: null,
  id: 'storefront-1',
  layoutStyle: 'grid',
  listingsCount: 0,
  name: 'Preview Store',
  sections: [],
  showInventoryBadges: true,
  slug: 'preview-store',
  status: 'published',
  surfaceStyle: 'soft',
  themePreset: 'catalog',
  updatedAt: '2026-06-12T00:00:00.000Z',
  visibility: 'public',
  wsId: 'ws-1',
};

describe('StorefrontSurface', () => {
  it('sanitizes hex accent colors only', () => {
    expect(sanitizeStorefrontAccentColor('#abc')).toBe('#aabbcc');
    expect(sanitizeStorefrontAccentColor('#123abc')).toBe('#123abc');
    expect(sanitizeStorefrontAccentColor('red')).toBeNull();
  });

  it('renders a preview empty state without enabling checkout', () => {
    render(
      <StorefrontSurface
        labels={{
          checkoutDisabled: 'Preview checkout disabled',
          emptyListingsDescription: 'Create a listing next.',
          emptyListingsTitle: 'No buyer listings',
        }}
        listings={[]}
        mode="preview"
        storefront={storefront}
      />
    );

    expect(screen.getAllByText('Preview Store')).toHaveLength(2);
    expect(screen.getByText('No buyer listings')).toBeInTheDocument();
    expect(screen.getByText('Create a listing next.')).toBeInTheDocument();
    expect(screen.getByText('Preview checkout disabled')).toBeDisabled();
  });

  it('keeps simulated storefront chrome customer-facing', () => {
    render(
      <StorefrontSurface
        labels={{ simulatedBadge: 'Simulated checkout' }}
        listings={[]}
        mode="store"
        storefront={{ ...storefront, checkoutMode: 'simulated' }}
      />
    );

    expect(screen.queryByText('Simulated checkout')).not.toBeInTheDocument();
    expect(screen.getAllByText('Preview Store')).toHaveLength(2);
  });

  it('blocks disabled checkout without showing checkout mode badges', () => {
    render(
      <StorefrontSurface
        labels={{
          checkoutDisabled: 'Checkout unavailable',
          checkoutDisabledBadge: 'Checkout disabled',
        }}
        listings={[]}
        mode="store"
        storefront={{ ...storefront, checkoutMode: 'disabled' }}
      />
    );

    expect(screen.queryByText('Checkout disabled')).not.toBeInTheDocument();
    expect(screen.getByText('Checkout unavailable')).toBeDisabled();
  });
});
