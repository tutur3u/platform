'use client';

import { NotesSharingControl } from '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control';
import { MeetingAiPanel } from '@tuturuuu/meet-core/features/meeting-ai/meeting-ai-panel';
import type { ComponentProps } from 'react';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { AccountRequiredState } from './account-required-state';
import { DocumentPanel } from './document-panel';
import { PersonalToolsPanel } from './personal-tools-panel';
import { ProgrammingPanel } from './programming-panel';
import { ResizableCallPanel } from './resizable-call-panel';

type ProgrammingProps = ComponentProps<typeof ProgrammingPanel>;

export function accountGatedCollaboration(
  requiresAccount: boolean,
  showProgramming: boolean,
  showDocument: boolean,
  programming: ProgrammingProps | null,
  document: ComponentProps<typeof DocumentPanel> | null
) {
  if (showProgramming)
    return requiresAccount ? (
      <AccountRequiredState />
    ) : programming ? (
      <ProgrammingPanel {...programming} />
    ) : null;
  if (showDocument)
    return requiresAccount ? (
      <AccountRequiredState />
    ) : document ? (
      <DocumentPanel {...document} />
    ) : null;
  return null;
}

export function AccountGatedPersonalDrawer({
  open,
  requiresAccount,
  accountId,
  label,
  onClose,
}: {
  open: boolean;
  requiresAccount: boolean;
  accountId: string;
  label: string;
  onClose: () => void;
}) {
  if (!open || MEETING_APP !== 'meet') return null;
  return requiresAccount ? (
    <ResizableCallPanel label={label}>
      <AccountRequiredState />
    </ResizableCallPanel>
  ) : (
    <PersonalToolsPanel accountId={accountId} onClose={onClose} />
  );
}

export function AccountGatedNotesDrawer({
  open,
  requiresAccount,
  label,
  canReadNotes,
  canManage,
  shareNotesAfterMeeting,
  wsId,
  meetingId,
  ai,
}: {
  open: boolean;
  requiresAccount: boolean;
  label: string;
  canReadNotes: boolean;
  canManage: boolean;
  shareNotesAfterMeeting?: boolean;
  wsId: string;
  meetingId: string;
  ai: ComponentProps<typeof MeetingAiPanel>['ai'];
}) {
  if (!open) return null;
  if (requiresAccount)
    return (
      <ResizableCallPanel label={label}>
        <AccountRequiredState />
      </ResizableCallPanel>
    );
  if (!canReadNotes) return null;
  return (
    <ResizableCallPanel label={label}>
      <div className="min-h-0 overflow-y-auto p-3">
        <MeetingAiPanel ai={ai} inCall />
        {canManage && (
          <div className="mt-3">
            <NotesSharingControl
              wsId={wsId}
              meetingId={meetingId}
              initialEnabled={shareNotesAfterMeeting}
            />
          </div>
        )}
      </div>
    </ResizableCallPanel>
  );
}
