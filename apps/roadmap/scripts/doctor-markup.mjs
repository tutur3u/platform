/** Markup checks the pre-seal doctor runs on every canonical document. */

/**
 * The navbar logo sits beside the visible brand name, so its alt text must be
 * empty: alt="Tuturuuu" there makes screen readers say the name twice (axe
 * image-redundant-alt).
 */
export function redundantAltFailures(html) {
  const failures = [];
  for (const match of String(html).matchAll(
    /<img\b[^>]*\balt="([^"]+)"[^>]*>\s*<span\b[^>]*>([^<]+)<\/span>/gi
  )) {
    if (match[1].trim().toLowerCase() === match[2].trim().toLowerCase())
      failures.push(
        `an image repeats its adjacent text "${match[2].trim()}" as alt (image-redundant-alt)`
      );
  }
  return failures;
}
