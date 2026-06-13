import { readdirSync, readFileSync } from 'node:fs';
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

function operatorSources() {
  return readdirSync(operatorDir)
    .filter((fileName) => fileName.endsWith('.tsx'))
    .map((fileName) => ({
      fileName,
      source: source(fileName),
    }));
}

describe('Inventory operator form workflows', () => {
  it('keeps visible controls on Tuturuuu UI primitives', () => {
    const violations = operatorSources().flatMap(({ fileName, source }) => {
      const tags = [...source.matchAll(/<(input|textarea|select|button)\b/g)];

      return tags
        .filter((match) => {
          const tagStart = match.index ?? 0;
          const tagContext = source.slice(tagStart, tagStart + 500);

          return !(
            fileName === 'inventory-image-upload.tsx' &&
            tagContext.includes('className="sr-only"') &&
            tagContext.includes('type="file"')
          );
        })
        .map((match) => `${fileName}: ${match[0]}`);
    });

    expect(violations).toEqual([]);
  });

  it('requires placeholders for shared visible field wrappers', () => {
    const violations = operatorSources().flatMap(({ fileName, source }) => {
      if (fileName === 'operator-form-fields.tsx') return [];

      const tags =
        source.match(
          /<(TextField|TextAreaField|NumberField|SelectField|SelectValueField)\b[\s\S]*?\/>/g
        ) ?? [];

      return tags
        .filter((tag) => !tag.includes('placeholder='))
        .map((tag) => `${fileName}: ${tag}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps dense mutating workflows dialog-only', () => {
    expect(source('setup-resource-section.tsx')).toContain('<DialogContent');
    expect(source('setup-batch-section.tsx')).toContain('<DialogContent');
    expect(source('costing-panel.tsx')).toContain('CostingProfileDialog');
    expect(source('costing-panel.tsx')).not.toContain('CostingProfileForm');
    expect(source('bundle-components-panel.tsx')).toContain('DialogTrigger');
    expect(source('product-row-actions.tsx')).toContain('editStockTitle');
    expect(source('sale-detail-panel.tsx')).toContain('SaleNoteDialog');
  });

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
