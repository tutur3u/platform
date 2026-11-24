import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, {
  type AtRule,
  type ChildNode,
  type Node,
  type Rule,
} from 'postcss';
import { describe, expect, it } from 'vitest';

/*
  Sorbet must restyle primitives without beating a caller's own utilities.
  Tailwind utilities live in @layer utilities and unlayered CSS outranks every
  layer, so Sorbet rules sit in @layer components (or base) or set variables
  that the primitives read. A rule may stay unlayered only when its comment
  says why (focus rings, the sidebar backdrop, the dark text-white fix, and
  rules whose own primitive utility would otherwise replace them).
*/

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readUiFile(name: string) {
  return readFileSync(resolve(repoRoot, 'packages/ui/src', name), 'utf8');
}

const SORBET_FILES = [
  'sorbet.css',
  'sorbet-surfaces.css',
  'sorbet-components.css',
  'floating-surface.css',
  'floating-bar.css',
] as const;

const SORBET = '[data-ui="sorbet"]';

/** Slots whose primitives read Sorbet only through CSS variables. */
const VARIABLE_SLOTS = [
  'button',
  'badge',
  'input',
  'textarea',
  'select-trigger',
  'card',
  'dialog-content',
  'alert-dialog-content',
  'tabs-trigger',
  'switch',
  'checkbox',
  'radio-group-item',
  'input-otp-slot',
];

interface SorbetRule {
  file: string;
  rule: Rule;
  inLayer: boolean;
  setsProperty: boolean;
}

function isLayered(rule: Rule) {
  let node = rule.parent as Node | undefined;
  while (node && node.type !== 'root') {
    if (node.type === 'atrule') {
      const atRule = node as AtRule;
      if (
        atRule.name === 'layer' &&
        /^(components|base)$/.test(atRule.params.trim())
      ) {
        return true;
      }
    }
    node = node.parent as Node | undefined;
  }
  return false;
}

/** The nearest comment before a node, climbing out of @media blocks. */
/**
 * The comment directly before a rule. A rule that opens an @media block may
 * take the comment directly before that block instead.
 */
function ownComment(rule: Rule): string {
  let current: ChildNode = rule;
  for (;;) {
    const previous = current.prev();
    if (previous) return previous.type === 'comment' ? previous.text : '';
    const parent = current.parent as Node | undefined;
    if (
      !parent ||
      parent.type !== 'atrule' ||
      (parent as AtRule).name !== 'media'
    ) {
      return '';
    }
    current = parent as ChildNode;
  }
}

const sorbetRules: SorbetRule[] = SORBET_FILES.flatMap((file) => {
  const found: SorbetRule[] = [];
  postcss.parse(readUiFile(file)).walkRules((rule) => {
    if (!rule.selector.includes(SORBET)) return;
    let setsProperty = false;
    rule.each((node) => {
      if (node.type === 'decl' && !node.prop.startsWith('--')) {
        setsProperty = true;
      }
    });
    found.push({ file, rule, inLayer: isLayered(rule), setsProperty });
  });
  return found;
});

const unlayered = sorbetRules.filter(
  ({ inLayer, setsProperty }) => setsProperty && !inLayer
);

const isFocusRule = (rule: Rule) =>
  rule.selector.includes(':focus-visible') &&
  rule.some((node) => node.type === 'decl' && node.prop === 'outline');

describe('Sorbet cascade layering', () => {
  it('finds Sorbet rules in every file', () => {
    for (const file of SORBET_FILES) {
      expect(
        sorbetRules.some((entry) => entry.file === file),
        file
      ).toBe(true);
    }
  });

  it('layers every Sorbet property rule unless its comment says why not', () => {
    for (const { file, rule } of unlayered) {
      expect(
        ownComment(rule),
        `${file}: ${rule.selector} must sit in @layer components or say why it stays unlayered`
      ).toMatch(/stays?\s+unlayered/i);
    }
  });

  it('never restyles a variable-driven primitive with an unlayered rule', () => {
    for (const { file, rule } of unlayered) {
      if (isFocusRule(rule)) continue;
      for (const slot of VARIABLE_SLOTS) {
        expect(
          rule.selector,
          `${file}: ${rule.selector} must set a variable instead`
        ).not.toContain(`[data-slot="${slot}"]`);
      }
    }
  });

  it('keeps the focus, backdrop and text-white rules unlayered on purpose', () => {
    for (const file of [
      'sorbet.css',
      'sorbet-surfaces.css',
      'sorbet-components.css',
    ]) {
      expect(
        unlayered.some(
          (entry) => entry.file === file && isFocusRule(entry.rule)
        ),
        file
      ).toBe(true);
    }
    const selectors = unlayered.map(({ rule }) => rule.selector);
    expect(
      selectors.some((s) => s.includes('[data-slot="sidebar-backdrop"]'))
    ).toBe(true);
    expect(selectors.some((s) => s.includes(':where(.text-white)'))).toBe(true);
  });

  it('imports tailwindcss before the Sorbet files', () => {
    const globals = readUiFile('globals.css');
    const tailwind = globals.indexOf('@import "tailwindcss";');
    expect(tailwind).toBeGreaterThan(-1);
    for (const file of SORBET_FILES) {
      const index = globals.indexOf(`@import "./${file}";`);
      expect(index, file).toBeGreaterThan(tailwind);
    }
  });

  it('declares the classic defaults on :root in @layer base', () => {
    const declared = new Set<string>();
    postcss.parse(readUiFile('globals.css')).walkAtRules('layer', (layer) => {
      if (layer.params.trim() !== 'base') return;
      layer.walkRules(':root', (rule) => {
        rule.walkDecls((decl) => {
          declared.add(decl.prop);
        });
      });
    });
    for (const name of [
      '--field-stroke',
      '--card-border',
      '--card-shadow',
      '--tabs-thumb-bg',
      '--tabs-thumb-shadow',
      '--control-transition',
      '--control-duration',
      '--control-ease',
    ]) {
      expect(declared.has(name), name).toBe(true);
    }
    // Radius variables stay unset in classic, so each primitive falls back
    // to the --radius of its own subtree.
    for (const name of [
      '--button-radius',
      '--badge-radius',
      '--field-radius',
      '--dialog-radius',
    ]) {
      expect(declared.has(name), name).toBe(false);
    }
  });

  it.each([
    [
      'button.tsx',
      [
        'rounded-[var(--button-radius,calc(var(--radius)_-_2px))]',
        'border-(--field-stroke)',
      ],
    ],
    ['badge.tsx', ['rounded-[var(--badge-radius,calc(var(--radius)_-_2px))]']],
    ['card.tsx', ['shadow-(--card-shadow)', 'border-(--card-border)']],
    [
      'input.tsx',
      [
        'rounded-[var(--field-radius,calc(var(--radius)_-_2px))]',
        'border-(--field-stroke)',
      ],
    ],
    [
      'select.tsx',
      [
        'rounded-[var(--field-radius,calc(var(--radius)_-_2px))]',
        'border-(--field-stroke)',
      ],
    ],
    [
      'textarea.tsx',
      [
        'rounded-[var(--field-radius,calc(var(--radius)_-_2px))]',
        'border-(--field-stroke)',
      ],
    ],
    ['dialog.tsx', ['rounded-[var(--dialog-radius,var(--radius))]']],
    ['alert-dialog.tsx', ['rounded-[var(--dialog-radius,var(--radius))]']],
  ])('%s reads the Sorbet variables', (file, classes) => {
    const source = readUiFile(`components/ui/${file}`);
    for (const className of classes) {
      expect(source).toContain(className);
    }
  });

  it('keeps buttonVariants() and badgeVariants() on the classic look', () => {
    // Elements styled with the variants alone, without the slot, never read
    // the Sorbet variables; Button and Badge add them.
    const button = readUiFile('components/ui/button.tsx');
    const variants = button.slice(
      button.indexOf('const buttonVariants'),
      button.indexOf('type ButtonVariant')
    );
    expect(variants).toContain('rounded-md');
    expect(variants).toContain('transition-[color,box-shadow]');
    expect(variants).toContain('border border-input');
    expect(variants).not.toContain('--button-radius');
    const badge = readUiFile('components/ui/badge.tsx');
    expect(badge).toContain('transition-[color,box-shadow]');
    expect(badge).not.toContain('--control-transition');
    const alertDialog = readUiFile('components/ui/alert-dialog.tsx');
    expect(alertDialog.match(/data-slot="button"/g)).toHaveLength(2);
    expect(alertDialog).toContain("buttonSlotClassName('outline')");
  });
});
