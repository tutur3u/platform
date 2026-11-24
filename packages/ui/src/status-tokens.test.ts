import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

const read = (path: string) =>
  readFileSync(resolve(repoRoot, 'packages/ui/src', path), 'utf8');

const globals = read('globals.css');
const sorbet = read('sorbet.css');
const ROLES = ['success', 'warning', 'info'] as const;

/** Custom properties declared by the first rule that starts with `selector`. */
function declarations(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing rule for ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('\n}', open));
  const found: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    found[match[1]!] = match[2]!.trim();
  }
  return found;
}

function hslToRgb(value: string): [number, number, number] {
  const match = /^hsl\(([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\)$/.exec(value);
  if (!match) throw new Error(`Not a plain hsl() colour: ${value}`);
  const h = Number(match[1]) / 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(hslToRgb(a)), luminance(hslToRgb(b))].sort(
    (x, y) => y - x
  );
  return (high! + 0.05) / (low! + 0.05);
}

const classic = {
  light: declarations(globals, ':root {\n  --root-background'),
  dark: declarations(globals, '.dark {\n  --root-background'),
};

describe('status colour roles', () => {
  it.each(['light', 'dark'] as const)(
    'keeps classic %s status text at 4.5:1 on the page and muted grounds',
    (mode) => {
      const tokens = classic[mode];
      for (const role of ROLES) {
        for (const ground of ['background', 'muted']) {
          expect(
            contrast(tokens[role]!, tokens[ground]!),
            `${mode} ${role} on ${ground}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );

  it('exposes each role as a Tailwind colour', () => {
    for (const role of ROLES) {
      expect(globals).toContain(`--color-${role}: var(--${role});`);
    }
  });

  it('follows the contrast-tested Sorbet inks', () => {
    const tokens = declarations(sorbet, ':root[data-ui="sorbet"] {');
    expect(tokens.success).toBe('var(--green)');
    expect(tokens.warning).toBe('var(--yellow)');
    expect(tokens.info).toBe('var(--blue)');
  });

  it('gives Alert a tone per role, tinted from the role', () => {
    const alert = read('components/ui/alert.tsx');
    for (const role of ROLES) {
      expect(alert).toContain(`${role}:`);
      expect(alert).toContain(`[&>svg]:text-${role}`);
      expect(alert).toContain(`var(--${role})_8%`);
    }
  });
});
