import { fireEvent, render, screen } from '@testing-library/react';
import type {
  InventoryBundle,
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { describe, expect, it, vi } from 'vitest';
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

const categoryBundle: InventoryBundle = {
  availableQuantity: 9,
  categoryCandidateScope: 'all_stock',
  categoryComponents: [
    {
      bundleId: 'bundle-keychains',
      candidates: [
        {
          availableQuantity: 5,
          componentId: 'component-keychains',
          listingId: 'listing-keychain-a',
          price: 1200,
          productId: 'product-keychain-a',
          selectionKind: 'listing',
          title: 'Acrylic Keychain',
          unitId: 'unit-1',
          unitName: 'Each',
          variantId: null,
          warehouseId: 'warehouse-1',
          warehouseName: 'Main',
        },
        {
          availableQuantity: 5,
          componentId: 'component-keychains',
          listingId: 'listing-keychain-b',
          price: 900,
          productId: 'product-keychain-b',
          selectionKind: 'listing',
          title: 'Metal Keychain',
          unitId: 'unit-1',
          unitName: 'Each',
          variantId: null,
          warehouseId: 'warehouse-1',
          warehouseName: 'Main',
        },
        {
          availableQuantity: 5,
          componentId: 'component-keychains',
          listingId: 'listing-keychain-c',
          price: 1500,
          productId: 'product-keychain-c',
          selectionKind: 'listing',
          title: 'Charm Keychain',
          unitId: 'unit-1',
          unitName: 'Each',
          variantId: null,
          warehouseId: 'warehouse-1',
          warehouseName: 'Main',
        },
      ],
      categoryId: 'category-keychains',
      categoryName: 'Keychains',
      discountStrategy: 'cheapest_free',
      freeQuantity: 1,
      id: 'component-keychains',
      quantityRequired: 3,
      sortOrder: 0,
    },
  ],
  components: [],
  createdAt: '2026-07-03T00:00:00.000Z',
  description: 'Choose any three keychains.',
  id: 'bundle-keychains',
  imageUrl: null,
  maxPerOrder: 4,
  name: 'Buy 2 Get 1 Keychains',
  price: 0,
  pricingMode: 'selected_items',
  slug: 'buy-2-get-1-keychains',
  status: 'active',
  storefrontId: storefront.id,
  updatedAt: '2026-07-03T00:00:00.000Z',
  wsId: storefront.wsId,
};

const bundleListing: InventoryStorefrontListing = {
  ...listing,
  bundleId: categoryBundle.id,
  id: 'listing-keychain-bundle',
  listingType: 'bundle',
  price: 0,
  productId: null,
  title: 'Buy 2 Get 1 Keychains',
  unitId: null,
  unitName: null,
  warehouseId: null,
  warehouseName: null,
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

  it('filters and searches the buyer catalog without losing the store context', () => {
    render(
      <StorefrontSurface
        bundles={[categoryBundle]}
        listings={[listing, bundleListing]}
        mode="store"
        storefront={storefront}
      />
    );

    expect(screen.getByText('1:1 Mentoring')).toBeInTheDocument();
    expect(screen.getByText('Buy 2 Get 1 Keychains')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Bundles' }));
    expect(screen.queryByText('1:1 Mentoring')).not.toBeInTheDocument();
    expect(screen.getByText('Buy 2 Get 1 Keychains')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search this store' }),
      {
        target: { value: '1:1' },
      }
    );
    expect(screen.getByText('1:1 Mentoring')).toBeInTheDocument();
    expect(screen.queryByText('Buy 2 Get 1 Keychains')).not.toBeInTheDocument();
  });

  it('opens a wide, readable Square Terminal product dialog', () => {
    const longListing = {
      ...listing,
      title: 'Shikishi Board (8.8 x 10 inches, 253 mm x 225 mm)',
    };

    render(
      <StorefrontSurface
        detailListingId={longListing.id}
        labels={{
          buyNow: 'Pay at terminal',
          squareTerminal: 'Square Terminal',
          squareTerminalDescription: 'Finish payment on the counter device.',
        }}
        listings={[longListing]}
        mode="store"
        onBuyNow={() => undefined}
        onDetailListingChange={() => undefined}
        storefront={{ ...storefront, checkoutMode: 'square_terminal' }}
      />
    );

    expect(screen.getByRole('dialog')).toHaveClass(
      'sm:max-w-6xl',
      'overflow-hidden',
      'p-0'
    );
    const visibleHeading = screen
      .getAllByRole('heading', { name: longListing.title })
      .find((heading) => !heading.classList.contains('sr-only'));
    expect(visibleHeading).toHaveClass(
      'break-words',
      'text-2xl',
      'sm:text-3xl'
    );
    expect(screen.getByText('Square Terminal')).toBeInTheDocument();
    expect(
      screen.getByText('Finish payment on the counter device.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pay at terminal' })
    ).toBeEnabled();
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

  it('opens category bundle selection and adds the configured selection to cart', () => {
    const onAddCartLine = vi.fn();

    render(
      <StorefrontSurface
        bundles={[categoryBundle]}
        listings={[bundleListing]}
        mode="store"
        onAddCartLine={onAddCartLine}
        storefront={storefront}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Select options/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Acrylic Keychain/ }));
    fireEvent.click(screen.getByRole('button', { name: /Metal Keychain/ }));
    fireEvent.click(screen.getByRole('button', { name: /Charm Keychain/ }));

    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument();
    expect(screen.getByText('$27.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddCartLine).toHaveBeenCalledWith(
      expect.objectContaining({
        bundleSelections: {
          'component-keychains': [
            expect.objectContaining({ listingId: 'listing-keychain-a' }),
            expect.objectContaining({ listingId: 'listing-keychain-b' }),
            expect.objectContaining({ listingId: 'listing-keychain-c' }),
          ],
        },
        listingId: bundleListing.id,
        quantity: 1,
        selectionKey: expect.stringContaining('component-keychains='),
      }),
      5
    );
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
