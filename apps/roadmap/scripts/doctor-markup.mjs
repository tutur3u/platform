/** Markup and size checks the pre-seal doctor runs on the public documents. */
import { MAX_DOCUMENT_BYTES } from '../src/csp.ts';
import { canonicalSmoke } from './canonical-smoke.mjs';

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

/**
 * Speculative loads the tuturuuu.com zone cannot serve. Cloudflare Speed
 * Brain answers every `Sec-Purpose: prefetch` request with 503, even for a
 * cached URL, so a prefetch or prerender link only ever yields a failed
 * request and a console error (production, 11 Nov 2026). workers.dev
 * previews do not show it, so the rule lives here.
 */
export function speculativeLinks(html) {
  const found = [];
  for (const match of String(html).matchAll(/<link\b([^>]*)>/gi)) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(match[1])?.[1] ?? '';
    const tokens = rel.toLowerCase().split(/\s+/);
    if (tokens.includes('prefetch') || tokens.includes('prerender')) {
      found.push(
        /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(match[1])?.[1] ?? '(no href)'
      );
    }
  }
  if (String(html).toLowerCase().includes('speculationrules'))
    found.push('speculationrules');
  return found;
}

/**
 * Every public document stays under half the CSP limit. Past
 * MAX_DOCUMENT_BYTES the Worker cannot hash inline scripts, so the router's
 * bootstrap and the hydration loader are blocked and the page never
 * hydrates. Sizes are characters, as the CSP check measures them.
 */
export const DOCUMENT_BUDGET = MAX_DOCUMENT_BYTES / 2;

export function documentBudgetFailures(document) {
  const size = document?.size;
  if (typeof size !== 'number')
    return [`${document?.path} size was not measured`];
  if (size <= DOCUMENT_BUDGET) return [];
  return [
    `${document.path} is ${size} characters, over the ${DOCUMENT_BUDGET} budget (half the ${MAX_DOCUMENT_BYTES} CSP limit, past which the page cannot hydrate)`,
  ];
}

/** One line per document: its size and its margin to the CSP limit. */
export function documentBudgetReport(documents = []) {
  return documents.map(
    (document) =>
      `document size ${document.path}: ${Math.round(document.size / 1024)} KiB, ${Math.round((1 - document.size / MAX_DOCUMENT_BYTES) * 100)}% under the ${MAX_DOCUMENT_BYTES / 1024} KiB CSP limit (budget ${DOCUMENT_BUDGET / 1024} KiB)`
  );
}

/**
 * The pages wrap sections in Suspense only to split hydration; nothing
 * suspends, so the server must render every boundary complete. A pending
 * boundary (<!--$?-->) streams its content later through an inline script
 * and hydrates late.
 */
export function pendingBoundaryFailures(html) {
  const pending = String(html).split('<!--$?-->').length - 1;
  return pending
    ? [`canonical HTML streams ${pending} pending Suspense boundaries`]
    : [];
}

/**
 * Inline scripts per public page: the router's four (JSON-LD, theme,
 * router bootstrap, stream boundary). The boot script and the hydration
 * loader are external same-origin assets, so a fifth inline script means
 * something new now depends on a CSP hash.
 */
export const EXPECTED_INLINE_SCRIPTS = 4;

/** How many inline scripts a page has, and how many its CSP leaves out. */
export function scriptCoverage(hashes, csp) {
  const policy = String(csp ?? '');
  return {
    inline: hashes.length,
    uncovered: hashes.filter((hash) => !policy.includes(hash)).length,
  };
}

export function inlineScriptFailures(document) {
  const scripts = document?.scripts;
  if (!scripts) return [`${document?.path} inline scripts were not counted`];
  const failures = [];
  if (scripts.inline !== EXPECTED_INLINE_SCRIPTS)
    failures.push(
      `${document.path} has ${scripts.inline} inline scripts, expected exactly ${EXPECTED_INLINE_SCRIPTS}`
    );
  if (scripts.uncovered > 0)
    failures.push(
      `${document.path} has ${scripts.uncovered} inline scripts its CSP does not hash`
    );
  return failures;
}

/**
 * The production canonical smoke, run against the built Worker before the
 * seal: it must find the hashed history asset from the page scripts, as it
 * will on tuturuuu.com. Prints its failures; returns its verdict.
 */
export async function builtWorkerSmoke(fetchImpl) {
  const smoke = await canonicalSmoke({ fetchImpl });
  for (const failure of smoke.failures)
    console.error(`- canonical smoke: ${failure}`);
  if (smoke.ok) console.log('canonical smoke passed on the built Worker');
  return smoke;
}

function attr(tag, name) {
  const match = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag);
  return match ? match[1] : null;
}

/** Opening tags carrying `id="…"`, by id. */
function tagsById(html) {
  const tags = new Map();
  for (const match of html.matchAll(/<[a-z][^>]*\sid="([^"]+)"[^>]*>/gi))
    tags.set(match[1], match[0]);
  return tags;
}

/**
 * Explanations behind (i) buttons and tooltips (components/info.tsx). In
 * the server HTML: "How statuses are computed" is a popover holding all
 * five definitions and is not a section of the page; every (i) button is a
 * named button that opens a popover it controls; every tooltip trigger is a
 * button described by the tooltip it opens; each status in the hero legend
 * has one. Native popovers need no script, so this is all the markup the
 * no-JS page and screen readers rely on.
 */
export function infoPopoverFailures(html) {
  const body = String(html);
  const failures = [];
  const ids = tagsById(body);
  const method = ids.get('status-method') ?? '';
  if (!/\spopover="(auto|manual)"/.test(method))
    failures.push('"How statuses are computed" is not a popover');
  const start = body.indexOf(method);
  const definitions = method
    ? body.slice(start, body.indexOf('</dl>', start)).split('<dd').length - 1
    : 0;
  if (definitions !== 5)
    failures.push(
      `the statuses popover holds ${definitions} definitions, expected 5`
    );
  if (/id="method-title"|class="section method"/.test(body))
    failures.push('"How statuses are computed" is still a page section');
  const buttons = [...body.matchAll(/<button\b[^>]*>/gi)].map((m) => m[0]);
  const infos = buttons.filter((tag) => /\sclass="info-btn"/.test(tag));
  if (!infos.length) failures.push('no (i) buttons');
  for (const tag of infos) {
    const target = attr(tag, 'popovertarget');
    if (
      attr(tag, 'type') !== 'button' ||
      !attr(tag, 'aria-label') ||
      attr(tag, 'aria-controls') !== target ||
      !/^(true|false)$/.test(attr(tag, 'aria-expanded') ?? '') ||
      !/\spopover="/.test(ids.get(target ?? '') ?? '')
    )
      failures.push(`(i) button for ${target} lacks its popover semantics`);
  }
  const tips = buttons.filter((tag) => /\sclass="tip-btn\b/.test(tag));
  for (const tag of tips) {
    const target = attr(tag, 'popovertarget');
    const tip = ids.get(target ?? '') ?? '';
    if (
      attr(tag, 'type') !== 'button' ||
      attr(tag, 'aria-describedby') !== target ||
      !/\srole="tooltip"/.test(tip) ||
      !/\spopover="/.test(tip)
    )
      failures.push(`tooltip trigger for ${target} lacks aria-describedby`);
  }
  const statusTips = tips.filter((tag) =>
    /popovertarget="tip-status-/i.test(tag)
  );
  if (statusTips.length !== 5)
    failures.push(
      `the status legend has ${statusTips.length} tooltips, expected 5`
    );
  return failures;
}

/** Every markup check the doctor runs on the canonical document. */
export function markupFailures(html) {
  return [
    ...redundantAltFailures(html),
    ...pendingBoundaryFailures(html),
    ...infoPopoverFailures(html),
  ];
}
