'use client';

export type RecentSidebarIconKey =
  | 'default'
  | 'task'
  | 'task-board'
  | 'whiteboard'
  | 'wallet'
  | 'invoice'
  | 'transaction'
  | 'project'
  | 'template'
  | 'debt';

export type RecentSidebarVisitBadge =
  | {
      kind: 'archived';
    }
  | {
      kind: 'board';
      value: string;
    }
  | {
      kind: 'list';
      value: string;
    }
  | {
      kind: 'ticket-prefix';
      value: string;
    };

export interface RecentSidebarVisitSnapshot {
  badges?: RecentSidebarVisitBadge[];
  iconKey?: RecentSidebarIconKey;
  subtitle?: string;
  title?: string;
}

export interface RecentSidebarVisitPayload {
  href: string;
  scopeWsId: string;
  snapshot?: RecentSidebarVisitSnapshot;
}

export const RECENT_SIDEBAR_VISIT_EVENT =
  'tuturuuu:sidebar-recent-item-visited';

export function dispatchRecentSidebarVisit(
  payload: RecentSidebarVisitPayload
): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<RecentSidebarVisitPayload>(RECENT_SIDEBAR_VISIT_EVENT, {
      detail: payload,
    })
  );
}
