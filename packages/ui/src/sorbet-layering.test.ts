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
  says why (focus rings, the sidebar backdrop, the dark text-white fix, the
  skeleton's pulse timing, Sonner, and rules whose own primitive utility would
  otherwise replace them).
*/

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readUiFile(name: string) {
  return readFileSync(resolve(repoRoot, 'packages/ui/src', name), 'utf8');
}

const SORBET_FILES = [
  'sorbet.css',
  'sorbet-presets.css',
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
  'sheet-overlay',
  'dialog-overlay',
  'drawer-overlay',
  'alert-dialog-overlay',
  'sheet-content',
  'drawer-content',
  'toggle',
  'toggle-group',
  'toggle-group-item',
  'alert',
  'table-head',
  'table-row',
  'mobile-top-bar',
  'mobile-dock-fade',
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
  rule.some(
    (node) =>
      node.type === 'decl' &&
      /^(outline|outline-width|box-shadow)$/.test(node.prop)
  );

const declaredProps = (rule: Rule) => {
  const props: string[] = [];
  rule.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) props.push(decl.prop);
  });
  return props;
};

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

  it('keeps only animation timing unlayered on the skeleton and the dock', () => {
    const skeleton = unlayered.filter(({ rule }) =>
      rule.selector.includes('[data-slot="skeleton"]')
    );
    expect(skeleton.length).toBeGreaterThan(0);
    for (const { rule } of skeleton) {
      for (const prop of declaredProps(rule)) {
        expect(prop, rule.selector).toMatch(/^animation/);
      }
    }
    for (const { file, rule } of unlayered) {
      expect(rule.selector, file).not.toContain(
        ':where([data-slot="mobile-dock"])'
      );
    }
  });

  it('draws the High Contrast card edge through --card-border', () => {
    const cards = sorbetRules.filter(
      ({ file, rule }) =>
        file === 'sorbet-presets.css' &&
        rule.selector.includes('[data-slot="card"]')
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.inLayer).toBe(true);
    expect(cards[0]!.setsProperty).toBe(false);
    expect(cards[0]!.rule.toString()).toContain('--card-border: var(--border)');
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
      '--sheet-shadow',
      '--tabs-thumb-bg',
      '--tabs-thumb-shadow',
      '--control-transition',
      '--control-duration',
      '--control-ease',
    ]) {
      expect(declared.has(name), name).toBe(true);
    }
    // These stay unset in classic, so each primitive falls back to its
    // classic value, resolved against the --radius and palette of its own
    // subtree.
    for (const name of [
      '--button-radius',
      '--badge-radius',
      '--field-radius',
      '--dialog-radius',
      '--overlay-scrim',
      '--sheet-bg',
      '--sheet-radius',
      '--toggle-radius',
      '--toggle-group-radius',
      '--toggle-weight',
      '--toggle-border',
      '--toggle-on-bg',
      '--toggle-on-fg',
      '--toggle-shadow',
      '--skeleton-bg',
      '--alert-radius',
      '--alert-border',
      '--alert-bg',
      '--table-head-weight',
      '--table-row-hover',
      '--mobile-top-bar-bg',
      '--mobile-dock-display',
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
    [
      'dialog.tsx',
      [
        'rounded-[var(--dialog-radius,var(--radius))]',
        'bg-[var(--overlay-scrim,rgb(0_0_0/0.5))]',
      ],
    ],
    [
      'alert-dialog.tsx',
      [
        'rounded-[var(--dialog-radius,var(--radius))]',
        'bg-[var(--overlay-scrim,rgb(0_0_0/0.8))]',
      ],
    ],
    [
      'sheet.tsx',
      [
        'bg-[var(--overlay-scrim,rgb(0_0_0/0.8))]',
        'bg-[var(--sheet-bg,var(--background))]',
        'shadow-(--sheet-shadow)',
      ],
    ],
    [
      'drawer.tsx',
      [
        'bg-[var(--overlay-scrim,rgb(0_0_0/0.8))]',
        'bg-[var(--sheet-bg,var(--background))]',
        'data-[vaul-drawer-direction=bottom]:rounded-t-[var(--sheet-radius,var(--radius))]',
      ],
    ],
    [
      'toggle.tsx',
      [
        'rounded-[var(--toggle-radius,calc(var(--radius)_-_2px))]',
        'font-[var(--toggle-weight,var(--font-weight-medium))]',
        'data-[state=on]:bg-[var(--toggle-on-bg,var(--accent))]',
        'data-[state=on]:text-[var(--toggle-on-fg,var(--accent-foreground))]',
        'border-[color:var(--toggle-border,var(--input))]',
      ],
    ],
    [
      'toggle-group.tsx',
      [
        'rounded-[var(--toggle-group-radius,calc(var(--radius)_-_2px))]',
        'rounded-[var(--toggle-radius,0px)]',
        'shadow-(--toggle-shadow,0_0_#0000)',
        'first:rounded-l-[var(--toggle-radius,calc(var(--radius)_-_2px))]',
        'last:rounded-r-[var(--toggle-radius,calc(var(--radius)_-_2px))]',
      ],
    ],
    [
      'skeleton-primitive.tsx',
      [
        'bg-[var(--skeleton-bg,color-mix(in_oklab,var(--primary)_10%,transparent))]',
      ],
    ],
    [
      'alert.tsx',
      [
        'rounded-[var(--alert-radius,var(--radius))]',
        'border-[color:var(--alert-border,var(--border))]',
        'bg-[var(--alert-bg,var(--background))]',
        'border-[color:var(--alert-border,color-mix(in_oklab,var(--destructive)_50%,transparent))]',
        'bg-[var(--alert-bg,transparent)]',
        'dark:border-[color:var(--alert-border,var(--destructive))]',
      ],
    ],
    [
      'table.tsx',
      [
        'font-[var(--table-head-weight,var(--font-weight-medium))]',
        'hover:bg-[var(--table-row-hover,color-mix(in_oklab,var(--muted)_50%,transparent))]',
      ],
    ],
    [
      'custom/structure.tsx',
      [
        'bg-[var(--mobile-top-bar-bg,color-mix(in_oklab,var(--background)_50%,transparent))]',
      ],
    ],
    [
      'custom/mobile-shell/mobile-dock.tsx',
      ['[display:var(--mobile-dock-display,none)]'],
    ],
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
