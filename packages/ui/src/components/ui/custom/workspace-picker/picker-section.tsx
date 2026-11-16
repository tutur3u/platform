'use client';

import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import type { PickerTranslator } from './translation';
import { useId } from 'react';
import type { PickerVariant } from './row-layout';
import { WorkspaceRow } from './workspace-row';

export type PickerSectionId =
  | 'personal'
  | 'internal'
  | 'pinned'
  | 'recent'
  | 'all'
  | 'hidden-rows';

export interface PickerRowContext {
  variant: PickerVariant;
  activeId: string;
  currentId?: string;
  defaultId?: string | null;
  pinnedIds: readonly string[];
  pendingIds: ReadonlySet<string>;
  canPinAny: boolean;
  canSetDefault: boolean;
  onActivate: (id: string) => void;
  onChoose: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  t: PickerTranslator;
}

export function PickerSection({
  id,
  heading,
  rows,
  hidden = false,
  context,
}: {
  id: PickerSectionId;
  heading?: string;
  rows: readonly InternalApiWorkspaceSummary[];
  hidden?: boolean;
  context: PickerRowContext;
}) {
  const headingId = useId();
  if (!rows.length) return null;
  return (
    <div
      aria-label={heading ? undefined : context.t('hidden_workspaces')}
      aria-labelledby={heading ? headingId : undefined}
      data-testid={
        id === 'hidden-rows' ? undefined : `workspace-picker-section-${id}`
      }
      role="group"
    >
      {heading ? (
        <div
          className="px-2.5 pt-2.5 pb-1 font-medium text-muted-foreground text-xs"
          id={headingId}
        >
          {heading}
        </div>
      ) : null}
      {rows.map((workspace) => (
        <WorkspaceRow
          active={workspace.id === context.activeId}
          canPinAny={context.canPinAny}
          canSetDefault={context.canSetDefault}
          current={workspace.id === context.currentId}
          hidden={hidden}
          isDefault={workspace.id === context.defaultId}
          key={workspace.id}
          onActivate={context.onActivate}
          onChoose={context.onChoose}
          onDefault={context.onDefault}
          onTogglePin={context.onTogglePin}
          onToggleHidden={context.onToggleHidden}
          pending={context.pendingIds.has(workspace.id)}
          pinned={context.pinnedIds.includes(workspace.id)}
          t={context.t}
          variant={context.variant}
          workspace={workspace}
        />
      ))}
    </div>
  );
}
