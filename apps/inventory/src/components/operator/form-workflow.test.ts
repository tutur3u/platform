import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getInventoryStockState } from './operator-stock';

const operatorDir = join(
  process.cwd(),
  'apps/inventory',
  'src',
  'components',
  'operator'
);
const inventoryDir = join(process.cwd(), 'apps/inventory');

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

function messages(locale: 'en' | 'vi') {
  return JSON.parse(
    readFileSync(join(inventoryDir, 'messages', `${locale}.json`), 'utf8')
  ) as Record<string, unknown>;
}

function valueAtPath(tree: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;

    return (current as Record<string, unknown>)[segment];
  }, tree);
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

  it('routes operator dropdowns through combobox-backed wrappers', () => {
    const violations = operatorSources().flatMap(({ fileName, source }) => {
      const rawSelectImport = source.includes('@tuturuuu/ui/select');
      const rawSelectElement = /<Select(?!Field|ValueField)\b/.test(source);

      return rawSelectImport || rawSelectElement ? [fileName] : [];
    });

    expect(violations).toEqual([]);
    expect(source('operator-form-fields.tsx')).toContain(
      '@tuturuuu/ui/custom/combobox'
    );
  });

  it('supports direct creation for simple setup-backed combobox fields', () => {
    const productSource = source('product-create-dialog.tsx');
    const productStockSource = source('product-stock-editor.tsx');
    const setupBatchSource = source('setup-batch-section.tsx');
    const costingSource = source('costing-profile-dialog.tsx');

    expect(productSource).toContain('createInventoryProductCategory');
    expect(productSource).toContain('createInventoryOwner');
    expect(productSource).toContain('createInventoryManufacturer');
    expect(productSource).toContain('createInventoryUnit');
    expect(productSource).toContain('createInventoryWarehouse');
    expect(productStockSource).toContain('createInventoryUnit');
    expect(productStockSource).toContain('createInventoryWarehouse');
    expect(setupBatchSource).toContain('createInventorySupplier');
    expect(setupBatchSource).toContain('createInventoryWarehouse');
    expect(costingSource).toContain('createInventoryProductCategory');
  });

  it('keeps toolbar and audit metadata layouts overflow-safe', () => {
    expect(source('operator-shell.tsx')).toContain(
      'lg:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)]'
    );
    expect(source('audit-rows.tsx')).toContain(
      'repeat(auto-fit,minmax(min(100%,12rem),1fr))'
    );
    expect(source('audit-rows.tsx')).toContain('overflow-hidden');
  });

  it('keeps dense mutating workflows dialog-only', () => {
    expect(source('setup-resource-section.tsx')).toContain(
      'OperatorDialogContent'
    );
    expect(source('setup-batch-section.tsx')).toContain(
      'OperatorDialogContent'
    );
    expect(source('costing-panel.tsx')).toContain('CostingProfileDialog');
    expect(source('costing-panel.tsx')).not.toContain('CostingProfileForm');
    expect(source('bundle-components-panel.tsx')).toContain('DialogTrigger');
    expect(source('product-row-actions.tsx')).toContain("t('tabs.stock')");
    expect(source('product-row-actions.tsx')).toContain('LifecyclePanel');
    expect(source('sale-detail-panel.tsx')).toContain('SaleNoteDialog');
  });

  it('moves row-level destructive actions into lifecycle dialogs', () => {
    expect(source('simple-rows.tsx')).not.toContain('deleteInventoryBundle');
    expect(source('simple-rows.tsx')).not.toContain(
      'deleteInventoryStorefront'
    );
    expect(source('commerce-panel.tsx')).not.toContain('deleteInventorySale');
    expect(source('storefront-listing-editor-dialog.tsx')).toContain(
      'LifecyclePanel'
    );
    expect(source('product-row-actions.tsx')).toContain('LifecyclePanel');
    expect(source('bundle-editor-dialog.tsx')).toContain('LifecyclePanel');
    expect(source('costing-profile-dialog.tsx')).toContain('LifecyclePanel');
    expect(source('setup-resource-section.tsx')).toContain('LifecyclePanel');
    expect(source('setup-batch-section.tsx')).toContain('LifecyclePanel');
  });

  it('routes Inventory dialogs through the pinned 3-zone shell', () => {
    // The shell keeps the header and footer pinned while only the body scrolls,
    // fixing the prior whole-dialog overflow.
    const shell = source('operator-dialog-shell.tsx');
    expect(shell).toContain('OperatorDialogContent');
    expect(shell).toContain('overflow-y-auto');
    expect(shell).toContain('flex max-h-[calc(100dvh-2rem)] flex-col');

    // No operator dialog may render a raw <DialogContent>; they must compose the
    // shell so header/footer stay pinned consistently.
    const violations = operatorSources()
      .filter(({ fileName }) => fileName !== 'operator-dialog-shell.tsx')
      .flatMap(({ fileName, source }) =>
        (source.match(/<DialogContent\b/g) ?? []).map(
          (tag) => `${fileName}: ${tag}`
        )
      );

    expect(violations).toEqual([]);
  });

  it('uses single-form create flows instead of sequential steppers', () => {
    for (const fileName of [
      'bundle-form-dialog.tsx',
      'costing-profile-dialog.tsx',
      'product-create-dialog.tsx',
      'storefront-form-dialog.tsx',
    ]) {
      const src = source(fileName);
      // Forms group fields inside the shell body or digestible tabs — never a
      // sequential next/back wizard where fields submit one panel at a time.
      expect(
        src.includes('OperatorDialogBody') || src.includes('OperatorDialogTabs')
      ).toBe(true);
      expect(src).not.toContain('FormStepper');
      expect(src).not.toContain('steps.length - 1');
    }
  });

  it('renders unlimited stock as non-low stock with the infinity symbol', () => {
    expect(
      getInventoryStockState({ amount: null, minAmount: 10 })
    ).toMatchObject({
      displayAmount: '∞',
      isLowStock: false,
      isUnlimited: true,
    });

    expect(getInventoryStockState({ amount: 0, minAmount: 10 })).toMatchObject({
      displayAmount: '0',
      isLowStock: true,
      isUnlimited: false,
    });
  });

  it('keeps setup empty states centralized instead of repeated per-card boxes', () => {
    expect(source('setup-panel.tsx')).toContain('emptyWorkspaceTitle');
    expect(source('setup-panel.tsx')).toContain('ResourceDialog');
    expect(source('setup-resource-section.tsx')).not.toContain('PackageOpen');
    expect(source('setup-batch-section.tsx')).not.toContain('PackageOpen');
  });

  it('keeps featured product images on the scoped Inventory Drive upload route', () => {
    const productSource = source('product-create-dialog.tsx');

    expect(productSource).toContain('target="product-featured-image"');
    expect(productSource).toContain('avatar_url: form.avatarUrl || null');
  });

  it('creates product stock rows only when stock is explicit and supports unlimited stock', () => {
    const productSource = source('product-create-dialog.tsx');
    const rowActionsSource = source('product-row-actions.tsx');
    const stockEditorSource = source('product-stock-editor.tsx');

    expect(productSource).toContain('shouldCreateStockRow');
    expect(productSource).toContain(
      'amount: form.unlimitedStock ? null : Number(amountValue || 0)'
    );
    expect(productSource).toContain('disabled={form.unlimitedStock}');
    expect(rowActionsSource).toContain('stockSaveState.shouldSave');
    expect(rowActionsSource).toContain('inventory: stockSaveState.inventory');
    expect(stockEditorSource).toContain('getInitialProductStockRows');
    expect(stockEditorSource).toContain('getProductStockSaveState');
    expect(stockEditorSource).toContain(
      'amount: row.unlimitedStock ? null : Number(row.amount || 0)'
    );
    expect(stockEditorSource).toContain('disabled={row.unlimitedStock}');
    expect(source('products-table.tsx')).toContain('stockState.isUnlimited');
  });

  it('connects costing profiles back to catalog products', () => {
    const costingSource = source('costing-profile-dialog.tsx');
    const tableSource = source('products-table.tsx');
    const dataHookSource = source('use-inventory-data.ts');

    expect(costingSource).toContain('productId: form.productId || null');
    expect(costingSource).toContain('handleProductChange');
    expect(costingSource).toContain('product.inventory?.[0]?.price');
    expect(dataHookSource).toMatch(
      /enabled:\s*\[[\s\S]*'costing'[\s\S]*\]\.includes\(view\),\s*queryFn:\s*\(\)\s*=>\s*listInventoryProducts/u
    );
    expect(tableSource).toContain('hasCostingCoverage');
    expect(tableSource).toContain("t('badges.costingReady')");
  });

  it('keeps literal operator translation keys covered in shipped bundles', () => {
    const requiredKeys = [
      'inventory.operator.columns.available',
      'inventory.operator.columns.checkout',
      'inventory.operator.columns.components',
      'inventory.operator.columns.coverage',
      'inventory.operator.columns.listings',
      'inventory.operator.columns.minimum',
      'inventory.operator.columns.price',
      'inventory.operator.columns.readiness',
      'inventory.operator.columns.status',
      'inventory.operator.columns.unitPrice',
      'inventory.operator.columns.updated',
      'inventory.operator.columns.visibility',
      'inventory.operator.forms.costingCoverageMissing',
      'inventory.operator.forms.costingCoverageReady',
      'inventory.operator.forms.addStockRow',
      'inventory.operator.forms.addCategoryComponent',
      'inventory.operator.forms.categoryCandidateScope',
      'inventory.operator.forms.categoryChoiceMode',
      'inventory.operator.forms.duplicateStockTargetHint',
      'inventory.operator.forms.fixedStockMode',
      'inventory.operator.forms.pricingMode',
      'inventory.operator.forms.removeStockRow',
      'inventory.operator.forms.revenueSharePartner',
      'inventory.operator.forms.revenueShareSplitPercent',
      'inventory.operator.forms.stockRowDescription',
      'inventory.operator.forms.stockRowTitle',
      'inventory.operator.forms.stockRow',
      'inventory.operator.stockWorkspace.tabs.stock',
      'inventory.operator.stockWorkspace.tabs.warehouses',
      'inventory.operator.stockWorkspace.warehousesDescription',
      'inventory.operator.stockWorkspace.warehousesTitle',
    ];

    for (const locale of ['en', 'vi'] as const) {
      const bundle = messages(locale);

      for (const key of requiredKeys) {
        expect(valueAtPath(bundle, key), `${locale}: ${key}`).toEqual(
          expect.any(String)
        );
      }
    }
  });

  it('keeps operator table views differentiated by workflow', () => {
    const productsSource = source('products-table.tsx');
    const rowsSource = source('simple-rows.tsx');

    expect(productsSource).toContain("view === 'stock'");
    expect(productsSource).toContain('toStockTableRows');
    expect(productsSource).toContain("t('columns.readiness')");
    expect(productsSource).toContain("t('columns.coverage')");
    expect(productsSource).toContain("t('columns.available')");
    expect(rowsSource).toContain('OperationsTable');
    expect(rowsSource).toContain('getStorefrontColumns');
    expect(rowsSource).toContain('getBundleColumns');
  });

  it('supports direct storefront hero uploads in create and edit flows', () => {
    const createSource = source('storefront-form-step.tsx');
    const editSource = source('storefront-editor-dialog.tsx');

    expect(createSource).toContain('target="storefront-hero"');
    expect(editSource).toContain('target="storefront-hero"');
  });

  it('creates bundles with stock-backed component payloads', () => {
    const bundleSource = source('bundle-form-dialog.tsx');
    const pickerSource = source('bundle-component-picker.tsx');

    expect(bundleSource).toContain('components: components.map');
    expect(bundleSource).toContain(
      'categoryComponents: categoryComponents.map'
    );
    expect(bundleSource).toContain('pricingMode: categoryComponents.length');
    expect(bundleSource).toContain('categoryCandidateScope:');
    expect(bundleSource).toContain('productId: component.productId');
    expect(bundleSource).toContain('unitId: component.unitId');
    expect(bundleSource).toContain('warehouseId: component.warehouseId');
    expect(pickerSource).toContain("t('fixedStockMode')");
    expect(pickerSource).toContain("t('categoryChoiceMode')");
    expect(pickerSource).toContain('selectedInventory');
    expect(pickerSource).toContain('createStockKey');
    expect(pickerSource).not.toContain('inventory?.[0]');
  });

  it('renders stock-row revenue share controls separately from product ownership', () => {
    const createSource = source('product-create-dialog.tsx');
    const editorSource = source('product-stock-editor.tsx');
    const formTypesSource = source('product-form-types.ts');

    expect(formTypesSource).toContain('revenueSharePartnerId');
    expect(formTypesSource).toContain('revenueShareSplitPercent');
    expect(createSource).toContain('revenue_share_partner_id');
    expect(createSource).toContain('revenue_share_bps');
    expect(createSource).toContain("t('revenueSharePartner')");
    expect(createSource).toContain("t('revenueShareSplitPercent')");
    expect(editorSource).toContain('revenueSharePartnerId');
    expect(editorSource).toContain('revenueShareSplitPercent');
    expect(editorSource).toContain('revenue_share_partner_id');
    expect(editorSource).toContain('revenue_share_bps');
  });
});
