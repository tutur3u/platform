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
  });

  it.each(['en', 'vi'] as const)('ships the compact option in %s', (locale) => {
    expect(
      messages(locale).inventory.operator.commerce.createSale.keepOpen
    ).toEqual(expect.any(String));
  });
});
