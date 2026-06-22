import { fireEvent, render, screen } from '@testing-library/react';
import type {
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { StorefrontSurface } from './storefront-surface';
import { formatStorefrontPrice, sanitizeStorefrontAccentColor } from './utils';

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

const secondListing: InventoryStorefrontListing = {
  ...listing,
  id: 'listing-2',
  price: 2500,
  productId: 'product-2',
  title: 'Team Workshop With Long Name',
  unitId: 'unit-2',
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
    fireEvent.click(screen.getByRole('button', { name: 'Cart: 0' }));
    expect(screen.getByText('Preview checkout disabled')).toBeDisabled();
  });

  it('links storefront chrome back to the store and opens cart from the header popover', () => {
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

    expect(screen.queryByText('$2.00')).not.toBeInTheDocument();

    const cartButton = screen.getByRole('button', { name: 'Cart: 2' });
    expect(cartButton).toHaveClass('h-11', 'min-w-14', 'shrink-0');
    expect(cartButton.querySelector('svg')).toHaveClass('size-5', 'shrink-0');

    fireEvent.click(cartButton);

    expect(screen.getByRole('region', { name: 'Cart' })).toBeInTheDocument();
    expect(screen.getAllByText('$2.00')).toHaveLength(2);
    expect(screen.getAllByText('1M')).toHaveLength(1);
  });

  it('keeps the compatibility cart page as a full cart review', () => {
    render(
      <StorefrontSurface
        cartHref="/preview-store/cart"
        cartLines={[{ listingId: listing.id, quantity: 2 }]}
        checkoutHref="/preview-store/checkout"
        listings={[listing]}
        mode="cart"
        onCheckoutOpen={() => undefined}
        storefront={storefront}
        storefrontHref="/preview-store"
      />
    );

    expect(screen.getByRole('region', { name: 'Cart' })).toBeInTheDocument();
    expect(screen.getByText('1:1 Mentoring')).toBeInTheDocument();
    expect(screen.getAllByText('$2.00')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Checkout/ })).toBeEnabled();
  });

  it('keeps long item names and large totals inside the cart row bounds', () => {
    const largeListing: InventoryStorefrontListing = {
      ...listing,
      price: 123_456_789,
      title:
        'A very long product title with specifications, measurements, and buyer-facing detail',
    };
    const expectedTotal = formatStorefrontPrice(largeListing.price * 5, 'USD');

    render(
      <StorefrontSurface
        cartLines={[{ listingId: largeListing.id, quantity: 5 }]}
        listings={[largeListing]}
        mode="cart"
        storefront={storefront}
      />
    );

    const amount = screen.getByTitle(expectedTotal);
    expect(amount).toHaveClass(
      'max-w-[9rem]',
      'overflow-hidden',
      'text-ellipsis',
      'text-right'
    );
    expect(screen.getByText(largeListing.title)).toHaveClass(
      'line-clamp-2',
      'break-words'
    );
  });

  it('prefills checkout buyer details while keeping editable form fields', () => {
    render(
      <StorefrontSurface
        buyerDefaults={{
          email: 'buyer@example.com',
          name: 'Sokora Buyer',
        }}
        cartLines={[
          { listingId: listing.id, quantity: 1 },
          { listingId: secondListing.id, quantity: 1 },
        ]}
        listings={[listing, secondListing]}
        mode="checkout"
        onCheckoutSubmit={() => undefined}
        storefront={storefront}
      />
    );

    expect(
      screen.getByRole('button', { name: /Order summary/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Contact details' })
    ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Cart: 0' }));
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
