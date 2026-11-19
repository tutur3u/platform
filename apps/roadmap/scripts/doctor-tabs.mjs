/**
 * The roadmap's tabs as the server renders them (src/components/tabs.tsx,
 * the shared Tabs through HashTabs). Every panel must be in the HTML
 * (crawlers, no-JS readers, the live refresh and old section links all rely
 * on it), and each tab is a link to its panel, so it works before any
 * script runs. The server never selects a tab beyond the default: the
 * fragment picks the visible panel in CSS until the page hydrates.
 */
export const TABS = ['overview', 'tracks', 'activity', 'releases', 'stack'];

/** Element ids each panel must hold: its sections, by their anchors. */
export const PANEL_SECTIONS = {
  overview: ['glance-title', 'status-method', 'latest-updates-title'],
  tracks: ['tracks', 'timeline-title'],
  activity: [
    'pulse',
    'pulse-products-title',
    'pulse-heat-title',
    'pulse-train-title',
    'updates',
  ],
  releases: ['store-releases'],
  stack: ['tech-stack', 'hosting-title', 'migration-title'],
};

function attr(tag, name) {
  const match = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag);
  return match ? match[1] : null;
}

function openingTag(html, id) {
  const match = new RegExp(`<[a-z]+\\b[^>]*\\sid="${id}"[^>]*>`, 'i').exec(
    html
  );
  return match ? { tag: match[0], at: match.index } : null;
}

export function tabFailures(html) {
  const body = String(html);
  const failures = [];
  const root = openingTag(body, 'sections');
  if (!root || !/\sclass="[^"]*\brm-tabs\b/.test(root.tag))
    return ['the tabs root (#sections) is missing'];
  if (/\sdata-ready=/.test(root.tag))
    failures.push('the server HTML is already marked hydrated (data-ready)');
  const panels = [];
  for (const [index, tab] of TABS.entries()) {
    const link = openingTag(body, `tab-${tab}`);
    if (
      !link ||
      !link.tag.startsWith('<a ') ||
      attr(link.tag, 'href') !== `#${tab}`
    )
      failures.push(`tab ${tab} is not a link to #${tab}`);
    else if (attr(link.tag, 'aria-controls') !== tab)
      failures.push(`tab ${tab} does not control its panel`);
    const panel = openingTag(body, tab);
    if (!panel) {
      failures.push(`panel ${tab} is not in the server HTML`);
      continue;
    }
    if (
      attr(panel.tag, 'data-panel') !== tab ||
      attr(panel.tag, 'aria-labelledby') !== `tab-${tab}`
    )
      failures.push(`panel ${tab} is not labelled by its tab`);
    if (/\shidden[\s=>]/.test(panel.tag))
      failures.push(`panel ${tab} is hidden in the server HTML`);
    if ((attr(panel.tag, 'data-default') !== null) !== (index === 0))
      failures.push(`panel ${tab} has the wrong default`);
    if (link && panel.at < link.at)
      failures.push(`panel ${tab} precedes the tab bar`);
    panels.push({ tab, at: panel.at });
  }
  for (const [index, panel] of panels.entries()) {
    const end = panels[index + 1]?.at ?? body.length;
    for (const id of PANEL_SECTIONS[panel.tab]) {
      const at = body.indexOf(` id="${id}"`);
      if (at < panel.at || at > end)
        failures.push(`#${id} is not in the ${panel.tab} panel`);
    }
  }
  return failures;
}
