import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_LABELS } from '../notification-labels';
import {
  NOTIFICATION_TAB_ROW_CLASS,
  NOTIFICATION_TITLE_ROW_CLASS,
  NotificationPanelFrameFallback,
} from '../notification-panel-frame';
import { NotificationPanelHeader } from '../notification-panel-header';

afterEach(cleanup);

function renderHeader(unreadCount: number, scopeAll?: boolean) {
  return render(
    <NotificationPanelHeader
      titleId="title"
      labels={DEFAULT_NOTIFICATION_LABELS}
      filter="unread"
      onFilter={vi.fn()}
      unreadCount={unreadCount}
      markAllPending={false}
      onMarkAll={vi.fn()}
      scopeAll={scopeAll}
      onToggleScope={vi.fn()}
    />
  );
}

/** jsdom has no layout, so compare the classes that fix each row's box. */
function frame(container: HTMLElement) {
  const title = container.querySelector('h2')?.parentElement;
  const tabs = container.querySelector('[role="tablist"]')?.parentElement;
  const tabButtons = [...container.querySelectorAll('[role="tab"]')];
  return {
    tabClasses: tabButtons.map((tab) => tab.className.split(' ')[0]),
    tabRow: tabs?.className,
    tabCount: tabButtons.length,
    titleRow: title?.className,
  };
}

describe('notification panel header frame', () => {
  it('keeps the title and tab rows identical with and without unread items', () => {
    const empty = renderHeader(0);
    const emptyFrame = frame(empty.container);
    const emptyAction = empty.container.querySelector(
      'button:not([role="tab"])'
    );
    empty.unmount();
    const populated = renderHeader(7);
    const populatedFrame = frame(populated.container);

    expect(emptyAction).toBeNull();
    expect(populatedFrame).toEqual(emptyFrame);
    expect(populatedFrame.titleRow).toBe(NOTIFICATION_TITLE_ROW_CLASS);
    expect(populatedFrame.tabRow).toBe(NOTIFICATION_TAB_ROW_CLASS);
    // The title row reserves the action's height even when it is absent.
    expect(populatedFrame.titleRow).toContain('min-h-8');
  });

  it('always reserves the Unread count slot so the next tab never moves', () => {
    const empty = renderHeader(0);
    const emptySlot = empty.container.querySelector('[role="tab"] span');
    expect(emptySlot).not.toBeNull();
    expect(emptySlot?.textContent).toBe('');
    const emptyClass = emptySlot?.className;
    empty.unmount();

    const populated = renderHeader(120);
    const slot = populated.container.querySelector('[role="tab"] span');
    expect(slot?.textContent).toBe('99+');
    expect(slot?.className).toBe(emptyClass);
  });

  it('uses the same header rows in the loading fallback', () => {
    const loaded = renderHeader(3);
    const loading = render(
      <NotificationPanelFrameFallback title="Notifications" />
    );
    const loadedFrame = frame(loaded.container);

    const rows = [...loading.container.querySelectorAll('div')].map(
      (node) => node.className
    );
    expect(rows).toContain(loadedFrame.titleRow);
    expect(rows).toContain(loadedFrame.tabRow);
    expect(
      loading.container.querySelectorAll('[class*="h-8"]').length
    ).toBeGreaterThanOrEqual(2);
  });
});
