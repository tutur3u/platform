import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const operatorDirectory = resolve(import.meta.dirname);
const inventoryDirectory = resolve(operatorDirectory, '../../..');

function source() {
  return readFileSync(
    resolve(operatorDirectory, 'sale-create-dialog.tsx'),
    'utf8'
  );
}

function messages(locale: 'en' | 'vi') {
  return JSON.parse(
    readFileSync(resolve(inventoryDirectory, `messages/${locale}.json`), 'utf8')
  ) as {
    inventory: {
      operator: {
        commerce: { createSale: { keepOpen?: string } };
      };
    };
  };
}

describe('SaleCreateDialog', () => {
  it('supports consecutive sale entry without closing the dialog', () => {
    const dialogSource = source();

    expect(dialogSource).toContain('keepOpenAfterSale');
    expect(dialogSource).toContain("t('keepOpen')");
    expect(dialogSource).toContain('if (keepOpenAfterSale)');
    expect(dialogSource).toContain('reset();');
    expect(dialogSource).toContain('setOpen(false);');
    expect(dialogSource).toContain('<CircleDollarSign');
    expect(dialogSource).toContain('<Pin');
  });

  it('ships a mobile sale FAB and delegates compact item controls', () => {
    const dialogSource = source();
    const commerceSource = readFileSync(
      resolve(operatorDirectory, 'commerce-panel.tsx'),
      'utf8'
    );

    expect(dialogSource).toContain('mobileFab');
    expect(dialogSource).toContain('<SaleProductPicker');
    expect(commerceSource).toContain('mobileFab');
  });

  it('keeps the mobile header and footer compact without duplicate close actions', () => {
    const dialogSource = source();
    const shellSource = readFileSync(
      resolve(operatorDirectory, 'operator-dialog-shell.tsx'),
      'utf8'
    );

    expect(dialogSource).toContain(
      'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
    );
    expect(dialogSource).toContain('mobileCollapsibleDescription');
    expect(dialogSource).toContain('size="icon"');
    expect(dialogSource).toContain('<Save');
    expect(dialogSource).not.toContain('DialogClose');
    expect(shellSource).toContain('<Accordion');
    expect(shellSource).toContain('sm:hidden');
  });

  it('requires the explicit save control instead of implicit form submission', () => {
    const dialogSource = source();

    expect(dialogSource).not.toContain('<form');
    expect(dialogSource).not.toContain('type="submit"');
    expect(dialogSource).toContain('onClick={submitSale}');
    expect(dialogSource).toContain(
      'if (!canSubmit || mutation.isPending) return;'
    );
    expect(dialogSource).toContain(
      'disabled={!canSubmit || mutation.isPending}'
    );
  });

  it.each([
    ['en', 'Keep open'],
    ['vi', 'Giữ mở'],
  ] as const)('ships the compact option in %s', (locale, expected) => {
    expect(
      messages(locale).inventory.operator.commerce.createSale.keepOpen
    ).toBe(expected);
  });
});
