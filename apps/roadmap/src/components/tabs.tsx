import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Activity, LayoutDashboard, ListChecks, Server } from '@tuturuuu/icons';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_TAB,
  fragmentId,
  isTabId,
  TAB_IDS,
  type TabId,
  tabForFragment,
  tabForKey,
} from './tab-model';

const ICONS: Record<TabId, typeof Activity> = {
  overview: LayoutDashboard,
  progress: ListChecks,
  activity: Activity,
  infrastructure: Server,
};

/** The tab whose panel holds the element with this id, if any. */
function panelOf(id: string): string | null {
  const element = document.getElementById(id);
  const panel = element?.closest<HTMLElement>('[data-panel]');
  return panel?.dataset.panel ?? null;
}

/**
 * The skip link (#sections). Once the tabs are live it focuses the selected
 * tab and leaves the fragment alone: #sections names no panel, so following
 * it would select Overview. Before hydration it stays a plain link.
 */
export function skipToTabs(event: MouseEvent<HTMLAnchorElement>) {
  const tab = document.querySelector<HTMLElement>(
    '.rm-tab[aria-selected="true"]'
  );
  if (!tab) return;
  event.preventDefault();
  tab.focus();
}

/**
 * The page's sections as four tabs. Every panel is in the server HTML. The
 * tab bar is a row of fragment links (#overview, #progress, …) and
 * styles/tabs.css shows the panel the fragment selects, so the right panel
 * paints first with no script, and old section links still land.
 *
 * After hydration the router location is the one source of truth: the
 * selected tab is tabForFragment(location hash) on every render, whatever
 * changed the location (a tab, a router navigation, a plain fragment link,
 * back or forward). A tab click only navigates. The markup becomes the
 * WAI-ARIA tabs pattern: tablist/tab/tabpanel roles, aria-selected and
 * aria-controls, a roving tabindex, arrow keys with Home and End. Until
 * then the first render matches the server exactly, so hydration never
 * mismatches and nothing moves.
 */
export function RoadmapTabs({
  label,
  labels,
  panels,
  path,
}: {
  label: string;
  labels: Record<TabId, string>;
  panels: Record<TabId, ReactNode>;
  /** This page's route path (the language root), for fragment navigation. */
  path: string;
}) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  // The server has no fragment: hydrate as it rendered, then upgrade.
  const [upgraded, setUpgraded] = useState(false);
  useEffect(() => setUpgraded(true), []);
  const active = upgraded ? tabForFragment(hash, panelOf) : null;
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);

  // A fragment naming a section in a panel that was hidden: bring the
  // section into view once its panel shows (the browser could not scroll
  // to it). The first location is the browser's own to scroll.
  useLayoutEffect(() => {
    if (!upgraded) return;
    const previous = seen.current;
    seen.current = hash;
    if (previous === null || previous === hash) return;
    const id = fragmentId(hash);
    if (id && !isTabId(id) && panelOf(id))
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [hash, upgraded]);

  // Keep the selected tab visible in the bar when it scrolls (phones).
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = active && list?.querySelector<HTMLElement>(`#tab-${active}`);
    if (!list || !tab) return;
    const left = tab.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft) list.scrollLeft = left - 8;
    else if (left + tab.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollLeft = left + tab.offsetWidth - list.clientWidth + 8;
  }, [active]);

  /** Select a tab by navigating to it; the location change selects it. */
  const select = (next: TabId, replace: boolean) => {
    if (next === active) return;
    void navigate({
      to: path,
      search: true,
      hash: next,
      replace,
      resetScroll: false,
      hashScrollIntoView: false,
    });
  };

  const onClick = (event: MouseEvent<HTMLAnchorElement>, tab: TabId) => {
    if (
      active === null ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    select(tab, false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (active === null) return;
    if (event.key === ' ') {
      // Space activates a tab like Enter does on its link.
      event.preventDefault();
      return;
    }
    const next = tabForKey(event.key, active);
    if (!next) return;
    event.preventDefault();
    select(next, true);
    listRef.current?.querySelector<HTMLElement>(`#tab-${next}`)?.focus();
  };

  return (
    <div
      className="rm-tabs"
      id="sections"
      tabIndex={-1}
      data-active={upgraded ? active : undefined}
    >
      <nav className="rm-tabbar" aria-label={label}>
        <div
          ref={listRef}
          className="rm-tablist"
          role={upgraded ? 'tablist' : undefined}
          aria-label={upgraded ? label : undefined}
          onKeyDown={onKeyDown}
        >
          {TAB_IDS.map((tab) => {
            const Icon = ICONS[tab];
            const selected = active === tab;
            return (
              <a
                key={tab}
                id={`tab-${tab}`}
                className="rm-tab"
                href={`#${tab}`}
                data-tab={tab}
                role={upgraded ? 'tab' : undefined}
                aria-selected={upgraded ? selected : undefined}
                aria-controls={upgraded ? tab : undefined}
                tabIndex={upgraded ? (selected ? 0 : -1) : undefined}
                onClick={(event) => onClick(event, tab)}
                onKeyUp={(event) => {
                  if (event.key === ' ' && upgraded) select(tab, false);
                }}
              >
                <Icon size={16} aria-hidden />
                <span>{labels[tab]}</span>
              </a>
            );
          })}
        </div>
      </nav>
      {TAB_IDS.map((tab) => (
        <section
          key={tab}
          id={tab}
          className="rm-panel"
          data-panel={tab}
          data-default={tab === DEFAULT_TAB ? '' : undefined}
          data-current={active === tab ? '' : undefined}
          role={upgraded ? 'tabpanel' : undefined}
          tabIndex={active === tab ? 0 : undefined}
          aria-labelledby={`tab-${tab}`}
        >
          {panels[tab]}
        </section>
      ))}
    </div>
  );
}
