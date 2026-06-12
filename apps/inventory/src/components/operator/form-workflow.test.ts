import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const operatorDir = join(
  process.cwd(),
  'apps/inventory',
  'src',
  'components',
  'operator'
);

function source(fileName: string) {
  return readFileSync(join(operatorDir, fileName), 'utf8');
}

describe('Inventory operator form workflows', () => {
  it('keeps featured product images on the scoped Inventory Drive upload route', () => {
    const productSource = source('product-create-dialog.tsx');

    expect(productSource).toContain('target="product-featured-image"');
    expect(productSource).toContain('avatar_url: form.avatarUrl || null');
  });

  it('supports direct storefront hero uploads in create and edit flows', () => {
    const createSource = source('storefront-form-step.tsx');
    const editSource = source('storefront-editor-dialog.tsx');

    expect(createSource).toContain('target="storefront-hero"');
    expect(editSource).toContain('target="storefront-hero"');
  });

  it('creates bundles with stock-backed component payloads', () => {
    const bundleSource = source('bundle-form-dialog.tsx');

    expect(bundleSource).toContain('components: components.map');
    expect(bundleSource).toContain('productId: component.productId');
    expect(bundleSource).toContain('unitId: component.unitId');
    expect(bundleSource).toContain('warehouseId: component.warehouseId');
  });
});
