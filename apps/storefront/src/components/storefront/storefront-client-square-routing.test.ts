import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'storefront-client.tsx'), 'utf8');

describe('StorefrontClient Square routing contract', () => {
  it('uses the server-resolved checkout method for safe fallback behavior', () => {
    expect(source).toContain(
      'checkoutOptionsQuery.data?.checkoutMode ?? storefront?.checkoutMode'
    );
    expect(source).toContain(
      "checkoutOptionsQuery.data?.routing === 'selected_terminal'"
    );
    expect(source).toContain('usesSelectedSquareTerminal &&');
    expect(source).toContain('squareDeviceId: usesSelectedSquareTerminal');
    expect(source).toContain(
      "isSquarePosCheckout\n      ? t('squarePosReserve')"
    );
  });
});
