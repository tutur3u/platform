import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { compile } from 'tailwindcss';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Input } from '../input';
import { FOCUS_MODALITY_ATTRIBUTE, readFocusModality } from './focus-modality';
import { SORBET_PRE_PAINT_SCRIPT } from './sorbet-pre-paint-script';

const root = () => document.documentElement;
const globalsCss = readFileSync(
  resolve(__dirname, '../../../globals.css'),
  'utf8'
);

/** The `focus-visible` variant exactly as globals.css declares it. */
const focusVisibleVariant = /@custom-variant focus-visible \([^\n]*\);/.exec(
  globalsCss
)?.[0];

let ringSelector = '';

beforeAll(async () => {
  expect(focusVisibleVariant).toBeDefined();
  const compiler = await compile(
    `@theme { --color-ring: #2a55a8; }\n${focusVisibleVariant}\n@tailwind utilities;`
  );
  const css = compiler.build(['focus-visible:ring-[3px]']);
  const selector = /([^{}\n]*ring-\\\[3px\\\][^{]*)\{/.exec(css)?.[1]?.trim();
  expect(selector).toBeDefined();
  // jsdom has no focus-visible heuristics; the browser treats a focused text
  // field as :focus-visible for every input method, which is what this
  // stands in for. The modality guard is what decides.
  ringSelector = selector!.replace(':focus-visible', ':focus');
  new Function(SORBET_PRE_PAINT_SCRIPT)();
});

afterEach(() => {
  root().removeAttribute(FOCUS_MODALITY_ATTRIBUTE);
});

function key(
  target: EventTarget,
  keyName: string,
  init: KeyboardEventInit = {}
) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: keyName, bubbles: true, ...init })
  );
}

function press(target: EventTarget) {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

describe('keyboard-only focus rings', () => {
  it('gates every focus-visible utility on the modality', () => {
    expect(ringSelector).toContain(
      ':where(:root:not([data-focus-modality="pointer"]) *)'
    );
  });

  it('shows the field ring after Tab and never after a click or tap', () => {
    const { getByRole } = render(<Input aria-label="Location" />);
    const field = getByRole('textbox');
    expect(field.className).toContain('focus-visible:ring-[3px]');
    expect(field.className).not.toMatch(/(^|\s)focus:ring/);

    press(field);
    field.focus();
    expect(readFocusModality()).toBe('pointer');
    expect(field.matches(ringSelector)).toBe(false);

    key(document.body, 'Tab');
    field.focus();
    expect(readFocusModality()).toBe('keyboard');
    expect(field.matches(ringSelector)).toBe(true);
  });

  it('keeps the browser heuristics before any input', () => {
    const { getByRole } = render(<Input aria-label="Title" />);
    const field = getByRole('textbox');
    field.focus();
    expect(readFocusModality()).toBeNull();
    expect(field.matches(ringSelector)).toBe(true);
  });

  it('treats caret keys inside a text field as typing, not navigation', () => {
    const { getByRole } = render(<Input aria-label="Notes" />);
    const field = getByRole('textbox');
    press(field);
    field.focus();
    for (const caretKey of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      key(field, caretKey);
    }
    key(field, 'a');
    key(field, 'Enter');
    key(field, 'Tab', { ctrlKey: true });
    expect(readFocusModality()).toBe('pointer');
    expect(field.matches(ringSelector)).toBe(false);
  });

  it('switches to keyboard for any key outside a text field', () => {
    const button = document.createElement('button');
    document.body.append(button);
    for (const navigationKey of ['ArrowDown', 'Enter', ' ', 'Escape']) {
      press(button);
      key(button, 'Shift');
      expect(readFocusModality()).toBe('pointer');
      key(button, navigationKey);
      expect(readFocusModality(), navigationKey).toBe('keyboard');
    }
    button.remove();
  });

  it('leaves a text field on Tab or Escape, but not mid-composition', () => {
    const { getByRole } = render(<Input aria-label="Search" />);
    const field = getByRole('textbox');
    press(field);
    key(field, 'Escape', { isComposing: true });
    const imeEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });
    Object.defineProperty(imeEscape, 'keyCode', { value: 229 });
    field.dispatchEvent(imeEscape);
    expect(readFocusModality()).toBe('pointer');
    key(field, 'Escape');
    expect(readFocusModality()).toBe('keyboard');
  });

  it('removes the browser outline for pointer focus in the base layer', () => {
    expect(globalsCss).toMatch(
      /:root\[data-focus-modality="pointer"\] :focus-visible \{\s*outline: none;/
    );
  });
});

/** Workspaces paused by the active-runtime policy keep their retained source. */
const INACTIVE = new Set(['apps/backend', 'apps/mobile', 'apps/tanstack-web']);
const repoRoot = resolve(__dirname, '../../../../../..');

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

describe('pointer-safe focus classes', () => {
  it('draws rings and outlines only on focus-visible in active apps and packages', () => {
    const workspaces = ['apps', 'packages'].flatMap((group) =>
      readdirSync(resolve(repoRoot, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${group}/${entry.name}`)
        .filter((workspace) => !INACTIVE.has(workspace))
    );
    const pointerRing =
      /(?<![\w-])(?:focus:(?:ring|ring-offset|outline-(?!none\b|hidden\b))|focus-within:(?:ring|outline))/u;
    const offenders = workspaces
      .flatMap((workspace) => sourceFiles(resolve(repoRoot, workspace, 'src')))
      .filter((file) => !file.endsWith('focus-modality.test.tsx'))
      .filter((file) => pointerRing.test(readFileSync(file, 'utf8')))
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });
});
