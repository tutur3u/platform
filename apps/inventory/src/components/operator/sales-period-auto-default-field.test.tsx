import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SalesPeriodAutoDefaultField } from './sales-period-auto-default-field';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function switchDisabled(html: string) {
  const button = html.match(/<button\b[^>]*>/)?.[0] ?? '';
  return /\sdisabled(?:=|\s|>)/.test(button);
}

describe('SalesPeriodAutoDefaultField', () => {
  it('disables the control and explains each saved-policy notice', () => {
    const unavailable = renderToStaticMarkup(
      <SalesPeriodAutoDefaultField
        canEdit={false}
        enabled={null}
        onCheckedChange={() => undefined}
        pending={false}
      />
    );
    expect(unavailable).toContain('autoDefault');
    expect(unavailable).toContain('autoDefaultUnavailable');
    expect(switchDisabled(unavailable)).toBe(true);

    const denied = renderToStaticMarkup(
      <SalesPeriodAutoDefaultField
        canEdit={false}
        enabled={false}
        onCheckedChange={() => undefined}
        pending={false}
      />
    );
    expect(denied).toContain('autoDefaultDenied');
    expect(switchDisabled(denied)).toBe(true);

    const enabled = renderToStaticMarkup(
      <SalesPeriodAutoDefaultField
        canEdit
        enabled
        onCheckedChange={() => undefined}
        pending={false}
      />
    );
    expect(enabled).toContain('autoDefaultOn');
    expect(switchDisabled(enabled)).toBe(false);

    const off = renderToStaticMarkup(
      <SalesPeriodAutoDefaultField
        canEdit
        enabled={false}
        onCheckedChange={() => undefined}
        pending={false}
      />
    );
    expect(off).toContain('autoDefaultOff');
    expect(switchDisabled(off)).toBe(false);

    const pending = renderToStaticMarkup(
      <SalesPeriodAutoDefaultField
        canEdit
        enabled={false}
        onCheckedChange={() => undefined}
        pending
      />
    );
    expect(switchDisabled(pending)).toBe(true);
  });
});
