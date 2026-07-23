import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(__dirname, 'square-checkout-routing.tsx'),
  'utf8'
);

describe('SquareCheckoutRouting UI contract', () => {
  it('keeps loading, authorization, same-device, and terminal states explicit', () => {
    expect(source).toContain('if (isLoading)');
    expect(source).toContain('if (errorMessage || !options?.staffAuthorized)');
    expect(source).toContain("if (options.routing === 'current_device')");
    expect(source).toContain("t('squareCurrentDeviceDescription')");
    expect(source).toContain("t('squareFallbackBadge')");
    expect(source).toContain("t('squareFallbackDescription')");
    expect(source).toContain("t('squareStaffProtection')");
    expect(source).toContain("t('squarePaymentStationDescription')");
  });

  it('renders only server-approved terminals and a safe empty state', () => {
    expect(source).toContain('devices.map((device)');
    expect(source).toContain('<SelectItem key={device.id} value={device.id}>');
    expect(source).toContain("t('squareChooseTerminal')");
    expect(source).toContain("t('squareNoTerminalDescription')");
    expect(source).toContain("t('squareDeviceRemembered')");
    expect(source).toContain("t('squareDeviceRememberHint')");
  });

  it('exposes a retry action after staff access or routing failures', () => {
    expect(source).toContain('onClick={onRetry}');
    expect(source).toContain("t('squareCheckAccessAgain')");
  });
});
