import {
  Images,
  Info,
  LayoutDashboard,
  Link2,
  ScrollText,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useLayoutEffect, useRef } from 'react';
import { STORE_TABS, type StoreTab } from '../../content/store-releases';
import type { Lang, Messages } from '../shared';
import { CopyButton } from './copy-button';
import type { Store } from './store-data';
import { StoreListingPanel } from './store-listing';
import {
  AvailabilityPanel,
  OverviewPanel,
  ScreenshotsPanel,
  WhatsNewPanel,
} from './store-panels';
import { STATUS_BADGE, StoreGlyph } from './store-row';

const TAB_ICON: Record<StoreTab, typeof Info> = {
  overview: LayoutDashboard,
  screenshots: Images,
  listing: ScrollText,
  'whats-new': Sparkles,
  availability: Info,
};

const PANEL = {
  overview: OverviewPanel,
  screenshots: ScreenshotsPanel,
  listing: StoreListingPanel,
  'whats-new': WhatsNewPanel,
  availability: AvailabilityPanel,
} as const;

/**
 * One store in a near-full-screen dialog (a full-screen sheet on phones):
 * the store's header and five tabs. The tab and the open state come from
 * the URL (see use-store-dialog.ts); Radix keeps focus inside, Escape and
 * the close button close it, and focus returns to the store's row (or the
 * page's selected tab when the row is hidden).
 */
export default function StoreDialog({
  store,
  tab,
  open,
  lang,
  t,
  onTab,
  onClose,
}: {
  store: Store;
  tab: StoreTab;
  open: boolean;
  lang: Lang;
  t: Messages['storeReleases'];
  onTab: (tab: StoreTab) => void;
  onClose: () => void;
}) {
  const { release } = store;
  const statuses = t.statuses as Record<string, string>;
  // The tabs share one scroll area: each tab and store opens at its top.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [tab, store.id]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Start on the selected tab, so arrow keys move between tabs at once.
        onOpenAutoFocus={(event) => {
          const tab = (
            event.currentTarget as HTMLElement | null
          )?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
          if (!tab) return;
          event.preventDefault();
          tab.focus();
        }}
        // Back to the store's row, or to the page's selected tab while the
        // row's panel is hidden (a link that landed on another tab). The
        // focus scrolls a row below the fold into view.
        onCloseAutoFocus={(event) => {
          const target = [
            `[data-store-row="${store.id}"]`,
            '#sections [role="tab"][aria-selected="true"]',
          ]
            .map((selector) => document.querySelector<HTMLElement>(selector))
            .find((element) => element?.getClientRects().length);
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        className="inset-0 flex h-dvh max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] sm:inset-6 sm:h-auto sm:max-w-none sm:rounded-2xl sm:border sm:pt-0 sm:pb-0 lg:inset-x-[max(2.5rem,calc((100vw-76rem)/2))] lg:inset-y-10"
      >
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <StoreGlyph store={store} size="lg" />
          <div className="grid min-w-0 gap-1">
            <DialogTitle className="truncate font-semibold text-xl">
              {store.name}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
              <Badge variant={STATUS_BADGE[release.status] ?? 'secondary'}>
                {statuses[release.status] ?? t.pending}
              </Badge>
              <span>
                {store.platform} · {release.version} ({t.build} {release.build})
              </span>
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline-flex">
              <CopyButton
                text={() => window.location.href}
                label={t.copyLink}
                done={t.linkCopied}
                failed={t.copyLinkFailed}
                icon={Link2}
              />
            </span>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label={t.close}
              >
                <X size={18} aria-hidden />
              </Button>
            </DialogClose>
          </div>
        </header>
        <Tabs
          value={tab}
          onValueChange={(next) => onTab(next as StoreTab)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="border-b px-4 pb-3 sm:px-6">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList aria-label={t.tabs.label} className="h-10">
                {STORE_TABS.map((id) => {
                  const Icon = TAB_ICON[id];
                  return (
                    <TabsTrigger key={id} value={id} className="px-3">
                      <Icon aria-hidden />
                      {t.tabs[id]}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          </div>
          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/40 px-4 py-5 sm:px-6"
          >
            {STORE_TABS.map((id) => {
              const Panel = PANEL[id];
              return (
                <TabsContent
                  key={id}
                  value={id}
                  className="mx-auto w-full max-w-5xl rounded-xl"
                >
                  <Panel store={store} lang={lang} t={t} />
                </TabsContent>
              );
            })}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
