import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SORBET_PRE_PAINT_SCRIPT,
  SorbetPrePaintScript,
} from './sorbet-pre-paint';
import {
  applySorbetTheme,
  parseSorbetTheme,
  SORBET_THEME_STORAGE_KEY,
} from './sorbet-theme';
import { SORBET_UI_STORAGE_KEY } from './sorbet-ui';

const root = () => document.documentElement;

function attributes() {
  return Object.fromEntries(
    [...root().attributes]
      .filter((a) => a.name === 'data-ui' || a.name.startsWith('data-sorbet-'))
      .map((a) => [a.name, a.value])
  );
}

function clear() {
  for (const name of Object.keys(attributes())) root().removeAttribute(name);
  window.localStorage.clear();
}

function runScript() {
  new Function(SORBET_PRE_PAINT_SCRIPT)();
}

/** What the script applies for a stored theme string. */
function scriptResult(stored: string) {
  clear();
  window.localStorage.setItem(SORBET_THEME_STORAGE_KEY, stored);
  runScript();
  return attributes();
}

/** What `applySorbetTheme` applies for the same stored string. */
function runtimeResult(stored: string) {
  clear();
  applySorbetTheme(parseSorbetTheme(stored));
  return attributes();
}

afterEach(clear);

describe('Sorbet pre-paint script', () => {
  it('turns Sorbet on only for the stored value "true"', () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'true');
    runScript();
    expect(root().getAttribute('data-ui')).toBe('sorbet');

    for (const stored of ['false', 'TRUE', '1', '']) {
      clear();
      window.localStorage.setItem(SORBET_UI_STORAGE_KEY, stored);
      runScript();
      expect(root().hasAttribute('data-ui'), stored).toBe(false);
    }
  });

  it.each([
    '{"preset":"matcha","radius":"round","density":"compact","font":"system"}',
    '{"preset":"sorbet","radius":"soft","density":"comfortable","font":"nunito"}',
    '{"preset":"high-contrast","accent":"#ff0000"}',
    '{"preset":"evil\\" onload=\\"x","radius":"sharp"}',
    '{"preset":["matcha"],"radius":{"x":1},"font":"noto"}',
    '{"preset":"toString","density":"__proto__"}',
    '["matcha"]',
    'null',
    'not json',
    `{"preset":"matcha","pad":"${'x'.repeat(600)}"}`,
  ])('applies the same attributes as the runtime for %s', (stored) => {
    expect(scriptResult(stored)).toEqual(runtimeResult(stored));
  });

  it('survives unavailable storage', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(runScript).not.toThrow();
      expect(attributes()).toEqual({});
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('renders one static script with the nonce and Rocket Loader opt-out', () => {
    const html = renderToStaticMarkup(<SorbetPrePaintScript nonce="abc" />);
    expect(html).toContain('nonce="abc"');
    expect(html).toContain('data-cfasync="false"');
    expect(html).toContain(SORBET_PRE_PAINT_SCRIPT);
    expect(SORBET_PRE_PAINT_SCRIPT).not.toMatch(/<\/script|<!--/i);
  });
});
