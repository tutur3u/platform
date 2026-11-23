// Page-side probes for sidebar-layout-shift.mjs. The function is serialized
// into the page by Playwright, so it must not reference module scope.
/** Runs in the page: records layout-shift entries and per-frame rects. */
export function installProbes() {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    const aside = document.querySelector('aside');
    for (const entry of list.getEntries()) {
      window.__shifts.push({
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: entry.sources.map((source) => {
          const node = source.node;
          const testId = node?.getAttribute?.('data-testid');
          return {
            node: node
              ? `${node.nodeName.toLowerCase()}${testId ? `[${testId}]` : ''}`
              : 'detached',
            inSidebar: Boolean(node && aside?.contains(node)),
            previous: source.previousRect.toJSON(),
            current: source.currentRect.toJSON(),
          };
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  // Logo, reveal trigger and icons as the user sees them; the inert copy of
  // the rail under a fading panel is not part of the page.
  window.__geometry = () => {
    const aside = document.querySelector('aside');
    const shown = (el) =>
      !el.closest('[data-slot="sidebar-rail-underlay"]') &&
      (typeof el.checkVisibility !== 'function' ||
        el.checkVisibility({ visibilityProperty: true }));
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const out = { icons: {}, extras: {} };
    const trigger = aside.querySelector('[data-sidebar-reveal-trigger]');
    if (trigger && shown(trigger)) {
      out.trigger = box(trigger);
      out.triggerRadius = Number.parseFloat(
        getComputedStyle(trigger).borderTopLeftRadius
      );
    }
    const logo = [...aside.querySelectorAll('[data-testid="brand-logo"]')].find(
      shown
    );
    if (logo) out.logo = box(logo);
    for (const link of aside.querySelectorAll('nav a[href]')) {
      const icon = link.querySelector('svg');
      if (icon && shown(link)) out.icons[link.getAttribute('href')] = box(icon);
    }
    const settings = aside.querySelector('[aria-label="Settings"] svg');
    if (settings && shown(settings)) out.extras.settings = box(settings);
    // Workspace avatar and account avatar. The workspace avatar is anchored to
    // the top like the logo and icons; the account avatar and Settings sit in
    // the bottom cluster, which stacks vertically in the rail but lays out as
    // a row in the panel, so only their x position is compared.
    const firstShown = (selector) =>
      [...aside.querySelectorAll(selector)].find(shown);
    const workspaceAvatar = firstShown(
      '[data-workspace-trigger] [data-slot="avatar"]'
    );
    if (workspaceAvatar) out.extras.workspaceAvatar = box(workspaceAvatar);
    const accountAvatar = firstShown(
      '[aria-label="Account"] [data-slot="avatar"]'
    );
    if (accountAvatar) out.extras.accountAvatar = box(accountAvatar);

    // Labels that do not fit (the fixture's labels all fit the panel).
    out.truncatedLabels = [
      ...aside.querySelectorAll('[data-slot="sidebar-item-label"]'),
    ]
      .filter((label) => shown(label) && label.clientWidth > 0)
      .filter((label) => label.scrollWidth > label.clientWidth + 0.5)
      .map((label) => label.textContent);
    const grid = document.querySelector('[data-testid="calendar-grid"]');
    out.grid = box(grid);
    return out;
  };
  // Properties animated inside the sidebar right now.
  window.__animatedProperties = () => {
    const aside = document.querySelector('aside');
    return document
      .getAnimations()
      .filter((animation) => aside.contains(animation.effect?.target ?? null))
      .map((animation) => ({
        name:
          animation.animationName ?? animation.transitionProperty ?? 'unknown',
        properties: [
          ...new Set(
            animation.effect
              .getKeyframes()
              .flatMap((frame) =>
                Object.keys(frame).filter(
                  (key) =>
                    ![
                      'offset',
                      'computedOffset',
                      'easing',
                      'composite',
                    ].includes(key)
                )
              )
          ),
        ],
      }));
  };
  window.__sample = (label, ms) =>
    new Promise((resolve) => {
      const frames = [];
      const start = performance.now();
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r && { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const tick = () => {
        frames.push({
          t: Math.round(performance.now() - start),
          grid: box(document.querySelector('[data-testid="calendar-grid"]')),
          aside: box(document.querySelector('aside')),
        });
        if (performance.now() - start < ms) requestAnimationFrame(tick);
        else resolve({ label, frames });
      };
      requestAnimationFrame(tick);
    });
}
