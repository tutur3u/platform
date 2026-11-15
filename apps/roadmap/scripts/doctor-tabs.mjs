/**
 * The roadmap's tabs as the server renders them (src/components/tabs.tsx).
 * Every panel must be in the HTML (crawlers, no-JS readers, the live
 * refresh and old section links all rely on it), and before hydration the
 * tab bar is plain fragment links: the WAI-ARIA tab roles arrive with the
 * keyboard behaviour, never without it.
 */
export const TABS = ['overview', 'progress', 'activity', 'infrastructure'];

/** Element ids each panel must hold: its sections, by their old anchors. */
export const PANEL_SECTIONS = {
  overview: ['glance-title', 'latest-updates-title'],
  progress: ['status-method', 'tracks', 'timeline-title'],
  activity: ['pulse', 'updates'],
  infrastructure: ['hosting-title', 'migration-title'],
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
  if (!root || !/\sclass="rm-tabs"/.test(root.tag))
    return ['the tabs root (#sections) is missing'];
  if (/\sdata-active=/.test(root.tag))
    failures.push('the server HTML already selects a tab (data-active)');
  const panels = [];
  for (const [index, tab] of TABS.entries()) {
    const link = openingTag(body, `tab-${tab}`);
    if (!link || attr(link.tag, 'href') !== `#${tab}`)
      failures.push(`tab ${tab} is not a link to #${tab}`);
    else if (/\s(role|aria-selected|aria-controls|tabindex)=/.test(link.tag))
      failures.push(`tab ${tab} has tab semantics before hydration`);
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
    if (/\s(hidden|role|data-current)[\s=>]/.test(panel.tag))
      failures.push(`panel ${tab} is hidden or selected in the server HTML`);
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
