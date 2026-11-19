import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  Layers,
  LayoutDashboard,
  ListChecks,
  Rocket,
} from '@tuturuuu/icons';
import { HashTabs } from '@tuturuuu/ui/custom/hash-tabs';
import {
  type MouseEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  fragmentId,
  isTabId,
  TAB_IDS,
  type TabId,
  tabForFragment,
} from './tab-model';

const ICONS: Record<TabId, typeof Activity> = {
  overview: LayoutDashboard,
  tracks: ListChecks,
  activity: Activity,
  releases: Rocket,
  stack: Layers,
};

/** The tab whose panel holds the element with this id, if any. */
function panelOf(id: string): string | null {
  if (typeof document === 'undefined') return null;
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
    '#sections [role="tab"][aria-selected="true"]'
  );
  if (!tab) return;
  event.preventDefault();
  tab.focus();
}

/**
 * The page's sections as tabs (`@tuturuuu/ui` Tabs through HashTabs). Every
 * panel is in the server HTML; the router location is the one source of
 * truth for the selected tab: it is tabForFragment(hash) on every render, so
 * a tab, a router navigation, a plain fragment link, back and forward all
 * select the tab their URL names. A tab only navigates, without scrolling;
 * a link into a section of another tab opens that tab and scrolls to it.
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
  const active = tabForFragment(hash, panelOf);
  const seen = useRef<string | null>(null);

  // A fragment naming a section in a panel that was hidden: bring the
  // section into view once its panel shows (the browser could not scroll
  // to it). The first location is the browser's own to scroll.
  useLayoutEffect(() => {
    const previous = seen.current;
    seen.current = hash;
    if (previous === null || previous === hash) return;
    const id = fragmentId(hash);
    if (id && !isTabId(id) && panelOf(id))
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <HashTabs
      id="sections"
      tabIndex={-1}
      className="rm-tabs"
      panelClassName="rm-panel"
      listClassName="h-11"
      label={label}
      value={active}
      tabs={TAB_IDS.map((id) => {
        const Icon = ICONS[id];
        return { id, label: labels[id], icon: <Icon size={16} aria-hidden /> };
      })}
      panels={panels}
      onValueChange={(next, source) => {
        if (next === active) return;
        void navigate({
          to: path,
          search: true,
          hash: next,
          replace: source === 'keyboard',
          resetScroll: false,
          hashScrollIntoView: false,
        });
      }}
    />
  );
}
