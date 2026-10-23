import { runInNewContext } from 'node:vm';
import { ThemeProvider } from 'next-themes';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { meetThemeBootstrap } from './theme-bootstrap';
import { MeetThemeProvider } from './theme-provider';

function browser(stored: string | null = null, dark = false) {
  const classes = new Set(['system', 'dark', 'unrelated']);
  const attributes: Record<string, string> = {};
  const style = { colorScheme: '' };
  return {
    classes,
    attributes,
    style,
    document: {
      documentElement: {
        classList: {
          remove: (...names: string[]) =>
            names.forEach((name) => {
              classes.delete(name);
            }),
          add: (name: string) => classes.add(name),
        },
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
        style,
      },
    },
    localStorage: { getItem: () => stored },
    window: { matchMedia: () => ({ matches: dark }) },
  };
}

const options = {
  attribute: 'class' as const,
  themes: ['system', 'light', 'dark'],
  enableSystem: true,
};

describe('Meet theme startup', () => {
  it('reproduces the missing helper in upstream function serialization after keepNames', () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider {...options}>content</ThemeProvider>
    );
    const script = markup.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const parts = script!.match(/^\(([\s\S]*)\)\(([\s\S]*)\)$/)!;
    expect(parts).toBeTruthy();
    const initializer = parts[1]!;
    const nestedName = initializer.match(/\bfunction\s+([\w$]+)\s*\(/)?.[1];
    expect(nestedName).toBeTruthy();
    // keepNames names hoisted inner functions via an external __name helper.
    // Reproduce that boundary without depending on a particular bundler package.
    const transformed = initializer.replace(
      '{',
      `{__name(${nestedName}, ${JSON.stringify(nestedName)});`
    );
    const context = { ...browser('dark'), serialized: '' };
    runInNewContext(
      `const __name = (fn, name) => Object.defineProperty(fn, "name", { value: name, configurable: true });
       const initialize = ${transformed};
       initialize(${parts[2]});
       globalThis.serialized = initialize.toString();`,
      context
    );
    expect(context.classes).toEqual(new Set(['unrelated', 'dark']));
    expect(context.serialized).toContain('__name');
    expect(() =>
      runInNewContext(`(${context.serialized})(${parts[2]})`, browser())
    ).toThrow('__name is not defined');
  });

  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', true, 'dark'],
    [null, false, 'light'],
  ])(
    'initializes stored %s with system dark=%s before hydration',
    (stored, dark, expected) => {
      const context = browser(stored, dark);
      const markup = renderToStaticMarkup(
        <MeetThemeProvider {...options}>content</MeetThemeProvider>
      );
      const scripts = [
        ...markup.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g),
      ];
      expect(scripts).toHaveLength(2);
      expect(scripts[0]?.[1]).toContain('type="application/json"');
      expect(scripts[1]?.[1]).toContain('data-cfasync="false"');
      runInNewContext(scripts[1]![2]!, context);
      expect(context.classes).toEqual(new Set(['unrelated', expected]));
      expect(context.style.colorScheme).toBe(expected);
    }
  );

  it('honors forced themes, custom values and disabled color schemes', () => {
    const context = browser('light');
    runInNewContext(
      meetThemeBootstrap({
        ...options,
        forcedTheme: 'dark',
        value: { dark: 'night', light: 'day' },
        enableColorScheme: false,
      }),
      context
    );
    expect(context.classes.has('night')).toBe(true);
    expect(context.style.colorScheme).toBe('');
  });

  it('handles unavailable storage without throwing and escapes HTML delimiters', () => {
    const context = browser();
    context.localStorage.getItem = () => {
      throw new Error('storage unavailable');
    };
    expect(() =>
      runInNewContext(meetThemeBootstrap(options), context)
    ).not.toThrow();
    expect(meetThemeBootstrap({ storageKey: '</script>' })).not.toContain(
      '</script>'
    );
  });
});
