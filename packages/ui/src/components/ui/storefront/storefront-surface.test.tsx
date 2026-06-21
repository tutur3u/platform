import { render, screen } from '@testing-library/react';
import type {
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
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

const listing: InventoryStorefrontListing = {
  availableQuantity: 8,
  bundleId: null,
  compareAtPrice: null,
  createdAt: '2026-06-12T00:00:00.000Z',
  description: 'A mentoring session for checkout tests.',
  id: 'listing-1',
  imageUrl: null,
  listingType: 'product',
  maxPerOrder: 5,
  price: 100,
  productId: 'product-1',
  sortOrder: 1,
  status: 'published',
  storefrontId: storefront.id,
  title: '1:1 Mentoring',
  unitId: 'unit-1',
  unitName: 'Session',
  updatedAt: '2026-06-12T00:00:00.000Z',
  warehouseId: 'warehouse-1',
  warehouseName: 'Main',
  wsId: storefront.wsId,
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

  it('links storefront chrome back to the store and keeps the cart icon stable', () => {
    render(
      <StorefrontSurface
        cartHref="/preview-store/cart"
        cartLines={[{ listingId: listing.id, quantity: 2 }]}
        listings={[listing]}
        mode="store"
        storefront={storefront}
        storefrontHref="/preview-store"
      />
    );

    expect(screen.getByRole('link', { name: 'Preview Store' })).toHaveAttribute(
      'href',
      '/preview-store'
    );

    const cartLink = screen.getByRole('link', { name: 'Cart: 2' });
    expect(cartLink).toHaveAttribute('href', '/preview-store/cart');
    expect(cartLink).toHaveClass('h-11', 'min-w-14', 'shrink-0');
    expect(cartLink.querySelector('svg')).toHaveClass('size-5', 'shrink-0');
    expect(screen.getAllByText('1M')).toHaveLength(1);
  });

  it('prefills checkout buyer details while keeping editable form fields', () => {
    render(
      <StorefrontSurface
        buyerDefaults={{
          email: 'buyer@example.com',
          name: 'Sokora Buyer',
        }}
        cartLines={[{ listingId: listing.id, quantity: 1 }]}
        listings={[listing]}
        mode="checkout"
        onCheckoutSubmit={() => undefined}
        storefront={storefront}
      />
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Sokora Buyer');
    expect(screen.getByLabelText('Email')).toHaveValue('buyer@example.com');
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByLabelText('Email')).toBeEnabled();
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

  it('renders only http storefront section links', () => {
    render(
      <StorefrontSurface
        listings={[]}
        mode="store"
        storefront={{
          ...storefront,
          sections: [
            {
              createdAt: null,
              description: null,
              href: null,
              id: 'section-empty',
              imageUrl: null,
              items: [],
              metadata: {},
              sectionType: 'promo',
              sortOrder: 0,
              status: 'published',
              storefrontId: storefront.id,
              title: null,
              updatedAt: null,
              wsId: storefront.wsId,
            },
            {
              createdAt: null,
              description: null,
              href: 'javascript:alert(document.domain)',
              id: 'section-unsafe',
              imageUrl: null,
              items: [],
              metadata: {},
              sectionType: 'promo',
              sortOrder: 1,
              status: 'published',
              storefrontId: storefront.id,
              title: 'Unsafe section',
              updatedAt: null,
              wsId: storefront.wsId,
            },
            {
              createdAt: null,
              description: null,
              href: 'https://example.com/promo',
              id: 'section-safe',
              imageUrl: null,
              items: [],
              metadata: {},
              sectionType: 'promo',
              sortOrder: 2,
              status: 'published',
              storefrontId: storefront.id,
              title: 'Safe section',
              updatedAt: null,
              wsId: storefront.wsId,
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Safe section')).toBeInTheDocument();
    expect(screen.queryByText('Storefront section')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'example.com/promo' })
    ).toHaveAttribute('href', 'https://example.com/promo');
    expect(screen.queryByText('javascript:alert(document.domain)')).toBeNull();
  });
});
