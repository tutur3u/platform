'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useId,
  useState,
  useSyncExternalStore,
} from 'react';
import { useActivityPane } from '../stage-layout/activity-pane-context';
import { CallResizeHandle } from './call-resize-handle';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

export const CallPanelOwnerContext = createContext<string | undefined>(
  undefined
);

function subscribeViewport(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

const panelMaximum = () =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.6)));

function readPanelWidth(key: string) {
  try {
    const saved = Number(window.localStorage.getItem(key));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
  } catch {
    // The call remains usable when storage is disabled.
  }
  return DEFAULT_WIDTH;
}

/**
 * A side panel with a resizable width. Inside a stage pane the pane owns the
 * size and the frame, so it renders as a plain column that fills it.
 */
export function ResizableCallPanel(props: {
  children: ReactNode;
  label: string;
  ownerId?: string;
}) {
  const pane = useActivityPane();
  return pane ? (
    <section
      aria-label={props.label}
      className="flex size-full min-h-0 flex-col"
    >
      {props.children}
    </section>
  ) : (
    <SideCallPanel {...props} />
  );
}

function SideCallPanel({
  children,
  label,
  ownerId,
}: {
  children: ReactNode;
  label: string;
  ownerId?: string;
}) {
  const t = useTranslations('meet.call');
  const account = useContext(CallPanelOwnerContext);
  const key = `meet:call-panel-width:${ownerId ?? account ?? 'guest'}`;
  const [draft, setDraft] = useState<{ key: string; width: number } | null>(
    null
  );
  const storedWidth = useSyncExternalStore(
    subscribeStorage,
    () => readPanelWidth(key),
    () => DEFAULT_WIDTH
  );
  const panelId = useId();
  const maximum = useSyncExternalStore(
    subscribeViewport,
    panelMaximum,
    () => MAX_WIDTH
  );
  const width = Math.min(
    draft?.key === key ? draft.width : storedWidth,
    maximum
  );
  return (
    <aside
      id={panelId}
      aria-label={label}
      style={{ '--call-panel-width': `${width}px` } as CSSProperties}
      className="relative flex max-h-[45dvh] min-h-0 w-full shrink-0 flex-col border-l bg-background md:max-h-none md:w-(--call-panel-width) md:max-w-[60vw]"
    >
      <CallResizeHandle
        label={t('resize_panel', { panel: label })}
        controls={panelId}
        axis="x"
        size={width}
        min={MIN_WIDTH}
        max={maximum}
        initial={DEFAULT_WIDTH}
        reverse
        className="absolute inset-y-0 -left-1 hidden w-2 md:flex"
        onResize={(next) => setDraft({ key, width: next })}
        onCommit={(next) => {
          try {
            window.localStorage.setItem(key, String(Math.round(next)));
            setDraft(null);
          } catch {
            // Keep the in-memory width for this panel.
          }
        }}
      />
      {children}
    </aside>
  );
}
