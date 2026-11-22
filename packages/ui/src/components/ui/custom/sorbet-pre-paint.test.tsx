import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SORBET_PRE_PAINT_SCRIPT,
  SORBET_PRE_PAINT_SCRIPT_HASH,
  SorbetPrePaintScript,
} from './sorbet-pre-paint';
import {
  applySorbetTheme,
  parseSorbetTheme,
  SORBET_THEME_STORAGE_KEY,
} from './sorbet-theme';
import { SORBET_UI_STORAGE_KEY } from './sorbet-ui';
import { NAV_LABELS_ATTRIBUTE, NAV_LABELS_STORAGE_KEY } from './nav-labels';

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
  root().removeAttribute(NAV_LABELS_ATTRIBUTE);
  window.localStorage.clear();
}

function runScript() {
  new Function(SORBET_PRE_PAINT_SCRIPT)();
}

/** The theme attributes alone, without the on/off switch. */
function themeAttributes() {
  const { 'data-ui': _switch, ...theme } = attributes();
  return theme;
}

/** What the script applies for a stored theme string. */
function scriptResult(stored: string) {
  clear();
  window.localStorage.setItem(SORBET_THEME_STORAGE_KEY, stored);
  runScript();
  return themeAttributes();
}

/** What `applySorbetTheme` applies for the same stored string. */
function runtimeResult(stored: string) {
  clear();
  applySorbetTheme(parseSorbetTheme(stored));
  return themeAttributes();
}

afterEach(clear);

describe('Sorbet pre-paint script', () => {
  it('publishes the CSP hash of the exact script', () => {
    const digest = createHash('sha256')
      .update(SORBET_PRE_PAINT_SCRIPT, 'utf8')
      .digest('base64');
    expect(SORBET_PRE_PAINT_SCRIPT_HASH).toBe(`'sha256-${digest}'`);
  });

  it('writes to the document only through setAttribute', () => {
    expect(SORBET_PRE_PAINT_SCRIPT).not.toMatch(
      /innerHTML|outerHTML|insertAdjacent|document\.write|eval\(|Function\(/
    );
    expect(SORBET_PRE_PAINT_SCRIPT.match(/\.\w+\(/g)).toEqual(
      expect.arrayContaining(['.setAttribute('])
    );
  });

  it('leaves default values absent, like applySorbetTheme', () => {
    window.localStorage.setItem(
      SORBET_THEME_STORAGE_KEY,
      '{"preset":"sorbet","radius":"soft","density":"comfortable","font":"nunito"}'
    );
    runScript();
    expect(attributes()).toEqual({ 'data-ui': 'sorbet' });
  });

  it('turns Sorbet off only for the stored opt-out "false"', () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'false');
    runScript();
    expect(root().hasAttribute('data-ui')).toBe(false);

    for (const stored of [null, 'true', 'TRUE', '1', '']) {
      clear();
      if (stored !== null)
        window.localStorage.setItem(SORBET_UI_STORAGE_KEY, stored);
      runScript();
      expect(root().getAttribute('data-ui'), String(stored)).toBe('sorbet');
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
      // Sorbet is the default, so it still applies; nothing else does.
      expect(attributes()).toEqual({ 'data-ui': 'sorbet' });
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('shows collapsed sidebar labels only for the stored value "true"', () => {
    window.localStorage.setItem(NAV_LABELS_STORAGE_KEY, 'true');
    runScript();
    expect(root().getAttribute(NAV_LABELS_ATTRIBUTE)).toBe('shown');

    for (const stored of ['false', 'TRUE', '1', '']) {
      clear();
      window.localStorage.setItem(NAV_LABELS_STORAGE_KEY, stored);
      runScript();
      expect(root().hasAttribute(NAV_LABELS_ATTRIBUTE), stored).toBe(false);
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
