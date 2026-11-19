'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';

export type HashTab = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
};

/**
 * Tabs whose selection is a URL fragment. The owner holds the location and
 * passes the selected id as `value`; a click, a key or a focus move calls
 * `onValueChange` and the owner navigates, so back, forward and plain
 * fragment links select a tab too.
 *
 * Every panel is rendered (`forceMount`) so the server HTML, crawlers and
 * in-page links see all of them; the selected one is `data-state="active"`.
 * Each trigger is an anchor to `#id`, so before hydration it still works as
 * a link. The root carries `data-ready` once hydrated, which lets a
 * stylesheet apply script-free fragment targeting until then. Panels are
 * addressable by their tab id and `data-default` marks the first.
 */
export function HashTabs({
  label,
  tabs,
  value,
  onValueChange,
  panels,
  className,
  listClassName,
  panelClassName,
  ...rootProps
}: {
  label: string;
  tabs: readonly HashTab[];
  /** The selected tab id, read from the location. */
  value: string;
  onValueChange: (id: string, source: 'pointer' | 'keyboard') => void;
  panels: Record<string, ReactNode>;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
} & Omit<React.ComponentProps<'div'>, 'dir' | 'defaultValue' | 'onChange'>) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const first = tabs[0]?.id ?? '';
  // The first client render matches the server (no location there).
  const selected = ready ? value : first;
  const list = useRef<HTMLDivElement>(null);

  // Keep the selected tab visible when the list scrolls (phones).
  useLayoutEffect(() => {
    const node = list.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]'
    );
    const bar = list.current;
    if (!bar || !node) return;
    const left = node.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft) bar.scrollLeft = left - 8;
    else if (left + node.offsetWidth > bar.scrollLeft + bar.clientWidth)
      bar.scrollLeft = left + node.offsetWidth - bar.clientWidth + 8;
  }, [selected]);

  const follow = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (
      !ready ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onValueChange(id, 'pointer');
  };

  return (
    <Tabs
      {...rootProps}
      value={selected}
      activationMode="automatic"
      onValueChange={(id) => onValueChange(id, 'keyboard')}
      data-ready={ready ? '' : undefined}
      className={className}
    >
      <TabsList
        ref={list}
        aria-label={label}
        className={cn('w-full justify-start overflow-x-auto', listClassName)}
      >
        {tabs.map(({ id, label: text, icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            id={`tab-${id}`}
            aria-controls={id}
            asChild
          >
            <a
              href={`#${id}`}
              type={undefined}
              // Before hydration no roving tab stop exists, so every link
              // stays reachable by Tab like any anchor.
              {...(ready ? {} : { tabIndex: 0 })}
              onClick={(event) => follow(event, id)}
            >
              {icon}
              {text}
            </a>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(({ id }) => (
        <TabsContent
          key={id}
          value={id}
          id={id}
          aria-labelledby={`tab-${id}`}
          forceMount
          tabIndex={-1}
          data-panel={id}
          data-default={id === first ? '' : undefined}
          className={panelClassName}
        >
          {panels[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
