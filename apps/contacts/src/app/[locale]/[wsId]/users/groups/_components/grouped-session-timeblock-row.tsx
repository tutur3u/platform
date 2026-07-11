'use client';

import {
  ExternalLink,
  Files,
  Filter,
  Pencil,
  Repeat,
  Tags,
} from '@tuturuuu/icons';
import type {
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroupSummary,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { GroupRosterHover } from './group-roster-hover';
import { GroupScheduleSummaryChips } from './group-schedule-summary-chips';
import { GroupedSessionInlineEdit } from './grouped-session-inline-edit';
import { sessionName } from './grouped-session-timeblock-utils';

interface GroupedSessionTimeblockRowProps {
  canChooseGroup: boolean;
  canUpdateSchedule: boolean;
  isInlineUpdating?: boolean;
  isSummaryLoading?: boolean;
  onEditSession: (session: WorkspaceUserGroupSession) => void;
  onFilterGroup: (groupId: string) => void;
  onInlineUpdate: (
    session: WorkspaceUserGroupSession,
    payload: UpdateWorkspaceUserGroupSessionPayload
  ) => Promise<void>;
  onRosterSearchTextChange?: (groupId: string, value: string) => void;
  onToggleSelected: (sessionId: string) => void;
  selected: boolean;
  session: WorkspaceUserGroupSession;
  summary?: WorkspaceUserGroupScheduleGroupSummary;
  wsId: string;
}

function IconAction({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="size-8 shrink-0 p-0"
          disabled={disabled}
          size="sm"
          type="button"
          variant="outline"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SessionBadges({ session }: { session: WorkspaceUserGroupSession }) {
  const t = useTranslations('ws-user-group-schedule');
  const visibleTags = session.tags.slice(0, 2);
  const hiddenTagCount = session.tags.length - visibleTags.length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
      {session.seriesId && (
        <Badge
          className="gap-1 rounded-sm px-1.5 py-0 text-xs"
          variant="secondary"
        >
          <Repeat className="h-3 w-3" />
          {t('recurring_badge')}
        </Badge>
      )}
      {session.files.length > 0 && (
        <Badge
          className="gap-1 rounded-sm px-1.5 py-0 text-xs"
          variant="secondary"
        >
          <Files className="h-3 w-3" />
          {t('files_attached_count', { count: session.files.length })}
        </Badge>
      )}
      {visibleTags.map((tag) => (
        <Badge
          className="max-w-40 gap-1 rounded-sm px-1.5 py-0 text-xs"
          key={tag.id}
          variant="outline"
        >
          <Tags className="h-3 w-3 shrink-0" />
          <span className="truncate">{tag.name}</span>
        </Badge>
      ))}
      {hiddenTagCount > 0 && (
        <span>{t('tag_count', { count: hiddenTagCount })}</span>
      )}
    </div>
  );
}

export function GroupedSessionTimeblockRow({
  canChooseGroup,
  canUpdateSchedule,
  isInlineUpdating,
  isSummaryLoading,
  onEditSession,
  onFilterGroup,
  onInlineUpdate,
  onRosterSearchTextChange,
  onToggleSelected,
  selected,
  session,
  summary,
  wsId,
}: GroupedSessionTimeblockRowProps) {
  const t = useTranslations('ws-user-group-schedule');
  const name = sessionName(session, t('untitled_session'));
  const [inlineOpen, setInlineOpen] = useState(false);

  return (
    <div
      className="rounded-md border bg-card px-3 py-2 shadow-xs"
      key={session.id}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[auto_minmax(0,1.3fr)_minmax(180px,0.8fr)_minmax(180px,0.9fr)_auto] lg:items-center">
        {canUpdateSchedule ? (
          <Checkbox
            aria-label={t('select_session_named', { name })}
            checked={selected}
            onCheckedChange={() => onToggleSelected(session.id)}
          />
        ) : (
          <div />
        )}
        <div className="min-w-0 space-y-1">
          <div className="truncate font-medium text-sm">{name}</div>
          {session.title && session.title !== session.groupName && (
            <div className="truncate text-muted-foreground text-xs">
              {session.title}
            </div>
          )}
          <SessionBadges session={session} />
        </div>
        <div className="col-start-2 min-w-0 lg:col-start-auto">
          <GroupRosterHover
            groupId={session.groupId}
            managerCount={summary?.managerCount}
            nonManagerCount={summary?.nonManagerCount}
            wsId={wsId}
            onSearchTextChange={onRosterSearchTextChange}
          />
        </div>
        <div className="col-start-2 min-w-0 lg:col-start-auto">
          <GroupScheduleSummaryChips
            isLoading={isSummaryLoading}
            summary={summary}
          />
        </div>
        <div className="col-start-2 flex shrink-0 items-center gap-1.5 lg:col-start-auto">
          {canChooseGroup && (
            <IconAction
              label={t('filter_group_named', { name })}
              onClick={() => onFilterGroup(session.groupId)}
            >
              <Filter className="h-4 w-4" />
            </IconAction>
          )}
          {canUpdateSchedule && (
            <>
              <IconAction
                disabled={isInlineUpdating}
                label={t('quick_edit_session_named', { name })}
                onClick={() => setInlineOpen((current) => !current)}
              >
                <Pencil className="h-4 w-4" />
              </IconAction>
              <IconAction
                label={t('open_full_editor_named', { name })}
                onClick={() => onEditSession(session)}
              >
                <ExternalLink className="h-4 w-4" />
              </IconAction>
            </>
          )}
        </div>
      </div>
      {inlineOpen && (
        <GroupedSessionInlineEdit
          disabled={isInlineUpdating}
          session={session}
          onCancel={() => setInlineOpen(false)}
          onSave={async (targetSession, payload) => {
            await onInlineUpdate(targetSession, payload);
            setInlineOpen(false);
          }}
        />
      )}
    </div>
  );
}
