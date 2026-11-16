'use client';

import { Check, Pin, Star } from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { Badge } from '../../badge';
import { WorkspaceIcon } from '../workspace-select-icon';
import {
  isFixedWorkspace,
  isInternalWorkspace,
  isPersonalWorkspace,
} from './partition';
import { PickerRowActions } from './row-actions';
import { type PickerVariant, pickerRowColumns } from './row-layout';
import { WorkspaceName } from './workspace-name';

export function tierClass(tier: string | null | undefined) {
  if (tier === 'PLUS')
    return 'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue';
  if (tier === 'PRO')
    return 'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple';
  if (tier === 'ENTERPRISE')
    return 'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber';
  return 'border-muted-foreground/30 bg-muted/50 text-muted-foreground';
}

export interface WorkspaceRowProps {
  workspace: InternalApiWorkspaceSummary;
  variant: PickerVariant;
  active: boolean;
  current: boolean;
  hidden: boolean;
  isDefault: boolean;
  pinned: boolean;
  pending: boolean;
  canPinAny: boolean;
  canSetDefault: boolean;
  onActivate: (id: string) => void;
  onChoose: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  t: (key: string) => string;
}

function MetaItem({ icon, children }: { icon?: ReactNode; children: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3 [&_svg]:shrink-0">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function WorkspaceRow({
  workspace,
  variant,
  active,
  current,
  hidden,
  isDefault,
  pinned,
  pending,
  canPinAny,
  canSetDefault,
  onActivate,
  onChoose,
  onDefault,
  onTogglePin,
  onToggleHidden,
  t,
}: WorkspaceRowProps) {
  const name = workspace.name || workspace.id;
  const tier = workspace.tier || 'FREE';
  const guest = workspace.access_type === 'guest';
  const showPinned = pinned && !hidden && !isFixedWorkspace(workspace);
  const meta: ReactNode[] = [];
  if (isPersonalWorkspace(workspace))
    meta.push(<MetaItem key="kind">{t('picker_personal_meta')}</MetaItem>);
  if (isInternalWorkspace(workspace))
    meta.push(<MetaItem key="kind">{t('picker_internal_meta')}</MetaItem>);
  if (guest) meta.push(<MetaItem key="guest">{t('guest_access')}</MetaItem>);
  if (variant === 'sheet') {
    if (showPinned)
      meta.push(
        <MetaItem icon={<Pin className="fill-current" />} key="pinned">
          {t('picker_pinned')}
        </MetaItem>
      );
    if (isDefault)
      meta.push(
        <MetaItem icon={<Star className="fill-current" />} key="default">
          {t('picker_state_default')}
        </MetaItem>
      );
  }
  if (hidden) meta.push(<MetaItem key="hidden">{t('picker_state_hidden')}</MetaItem>);
  const label = [
    name,
    tier,
    current ? t('current_workspace') : null,
    isDefault ? t('picker_state_default') : null,
    showPinned ? t('picker_pinned') : null,
    hidden ? t('picker_state_hidden') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      aria-label={name}
      className={cn(
        'group grid items-center rounded-lg hover:bg-accent/60 focus-within:bg-accent',
        variant === 'sheet' ? 'min-h-14' : 'min-h-12',
        active && 'bg-accent/60'
      )}
      data-active={active ? 'true' : undefined}
      data-current={current ? 'true' : undefined}
      data-picker-row=""
      data-testid={`workspace-picker-row-${workspace.id}`}
      role="group"
      style={{ gridTemplateColumns: pickerRowColumns(variant) }}
    >
      <button
        aria-current={current ? 'true' : undefined}
        aria-label={label}
        className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg py-2 ps-2.5 pe-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-picker-cell="main"
        data-workspace-choice=""
        data-workspace-id={workspace.id}
        onClick={() => onChoose(workspace)}
        onFocus={() => onActivate(workspace.id)}
        tabIndex={active ? 0 : -1}
        title={name}
        type="button"
      >
        <WorkspaceIcon
          avatarUrl={workspace.avatar_url}
          className="h-8 max-h-8 min-h-8 w-8 min-w-8 max-w-8"
          name={name}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <WorkspaceName name={name} />
          {meta.length ? (
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-muted-foreground text-xs">
              {meta}
            </span>
          ) : null}
        </span>
      </button>
      <span
        aria-hidden="true"
        className="flex justify-end pe-1"
        data-picker-cell="badge"
      >
        <Badge
          className={cn('h-5 px-1.5 font-medium text-[10px]', tierClass(tier))}
          variant="outline"
        >
          {tier}
        </Badge>
      </span>
      <span
        aria-hidden="true"
        className="grid place-items-center"
        data-picker-cell="state"
      >
        {current ? <Check className="size-4 text-primary" /> : null}
      </span>
      <PickerRowActions
        canDefault={!hidden && !guest && canSetDefault}
        canPin={canPinAny && !hidden && !isFixedWorkspace(workspace)}
        hidden={hidden}
        isDefault={isDefault}
        name={name}
        onDefault={() => onDefault(workspace.id)}
        onTogglePin={() => onTogglePin(workspace.id)}
        onToggleHidden={() => onToggleHidden(workspace.id, !hidden)}
        pending={pending}
        pinned={pinned}
        t={t}
        tabbable={active}
        variant={variant}
      />
    </div>
  );
}
