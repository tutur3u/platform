/**
 * Static guards for the roadmap stylesheet: the expensive effects stay off
 * phones and low-end devices. Pure and dependency-free, so tests (and any
 * checker) can run them on the source or the built CSS.
 *
 * - Infinite animations run only inside `@media` that requires both
 *   `prefers-reduced-motion: no-preference` and `min-width: 1024px`, on a
 *   selector that excludes lite mode (`:root:not([data-lite])`).
 * - backdrop-filter, mix-blend-mode and filter: blur() appear only inside a
 *   `min-width: 1024px` media block, on a selector that excludes lite mode.
 * - No transition or animation of layout properties (height, width, top…),
 *   which cannot run on the compositor.
 */

export type Declaration = {
  property: string;
  value: string;
  selector: string;
  media: string[];
};

/** Every declaration with its selector and enclosing at-rule preludes. */
export function cssDeclarations(css: string): Declaration[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Declaration[] = [];
  const stack: string[] = [];
  let buffer = '';
  let quote: string | null = null;
  let parens = 0;
  const flush = () => {
    const declaration = buffer.trim();
    buffer = '';
    const colon = declaration.indexOf(':');
    const selector = stack.at(-1) ?? '';
    if (colon < 0 || !selector || selector.startsWith('@')) return;
    out.push({
      property: declaration.slice(0, colon).trim().toLowerCase(),
      value: declaration.slice(colon + 1).trim(),
      selector,
      media: stack.filter((entry) => entry.startsWith('@')),
    });
  };
  for (const char of text) {
    if (quote) {
      buffer += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
    } else if (char === '(') {
      parens += 1;
      buffer += char;
    } else if (char === ')') {
      parens -= 1;
      buffer += char;
    } else if (char === '{' && parens === 0) {
      stack.push(buffer.trim().replace(/\s+/g, ' '));
      buffer = '';
    } else if (char === '}' && parens === 0) {
      flush();
      stack.pop();
    } else if (char === ';' && parens === 0) {
      flush();
    } else {
      buffer += char;
    }
  }
  return out;
}

const RICH_SCREEN = /min-width:\s*1024px|width\s*>=\s*1024px/;
const MOTION_ALLOWED = /prefers-reduced-motion:\s*no-preference/;
const NOT_LITE = /^:root:not\(\[data-lite\]\)\s/;

function describe(declaration: Declaration) {
  const where = declaration.media.length
    ? ` in ${declaration.media.join(' > ')}`
    : '';
  return `${declaration.selector} { ${declaration.property}: ${declaration.value} }${where}`;
}

function richOnly(declaration: Declaration, motion: boolean) {
  const media = declaration.media.join(' ');
  const selectors = declaration.selector.split(',').map((s) => s.trim());
  return (
    RICH_SCREEN.test(media) &&
    (!motion || MOTION_ALLOWED.test(media)) &&
    selectors.every((selector) => NOT_LITE.test(selector))
  );
}

/** Infinite animations outside the desktop, motion-allowed, non-lite tier. */
export function infiniteAnimationFailures(css: string): string[] {
  return cssDeclarations(css)
    .filter(
      (d) =>
        (d.property === 'animation' ||
          d.property === 'animation-iteration-count') &&
        /\binfinite\b/.test(d.value) &&
        !richOnly(d, true)
    )
    .map((d) => `infinite animation outside the rich tier: ${describe(d)}`);
}

/** Backdrop filters, blend modes and blur filters outside the rich tier. */
export function heavyEffectFailures(css: string): string[] {
  return cssDeclarations(css)
    .filter((d) => {
      const heavy =
        ((d.property === 'backdrop-filter' ||
          d.property === '-webkit-backdrop-filter') &&
          d.value !== 'none') ||
        (d.property === 'mix-blend-mode' && d.value !== 'normal') ||
        (d.property === 'filter' && /\bblur\(/.test(d.value));
      return heavy && !richOnly(d, false);
    })
    .map((d) => `heavy effect outside the rich tier: ${describe(d)}`);
}

const LAYOUT_PROPERTIES =
  /\b(height|width|top|left|right|bottom|margin|padding)\b/;

/** Transitions or keyframes that animate layout (non-composited) properties. */
export function layoutAnimationFailures(css: string): string[] {
  const failures: string[] = [];
  for (const d of cssDeclarations(css)) {
    if (d.property === 'transition' || d.property === 'transition-property') {
      if (LAYOUT_PROPERTIES.test(d.value.replace(/cubic-bezier\([^)]*\)/g, '')))
        failures.push(`layout transition: ${describe(d)}`);
    }
    const keyframes = d.media.find((entry) => entry.startsWith('@keyframes'));
    if (keyframes && LAYOUT_PROPERTIES.test(d.property))
      failures.push(`layout keyframes ${keyframes}: ${describe(d)}`);
  }
  return failures;
}
