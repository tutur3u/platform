'use client';

import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Pin,
  Plus,
  Star,
  UserPlus,
  X,
} from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { useWorkspaceVisibility } from '../../../hooks/use-workspace-visibility';
import { Badge } from '../badge';
import { Button } from '../button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../command';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { useWorkspacePickerPreferences } from './use-workspace-picker-preferences';
import { WorkspaceIcon } from './workspace-select-icon';

type Visibility = ReturnType<typeof useWorkspaceVisibility>;
type PickerPreferences = ReturnType<typeof useWorkspacePickerPreferences>;
type PickerVariant = 'dialog' | 'sheet';

const SHEET_QUERY = '(max-width: 767px)';

function subscribeSheet(onStoreChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(SHEET_QUERY);
  if (typeof query.addEventListener !== 'function') return () => {};
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function sheetSnapshot() {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(SHEET_QUERY).matches;
}

function usePickerVariant(): PickerVariant {
  const sheet = useSyncExternalStore(
    subscribeSheet,
    sheetSnapshot,
    () => false
  );
  return sheet ? 'sheet' : 'dialog';
}

/**
 * ⌘K / Ctrl+K is already owned by the global command launcher (and the web
 * and finance palettes). Shift keeps this picker off that shortcut.
 */
export function useWorkspacePickerShortcut(open: () => void) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      openRef.current();
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}

function tierClass(tier: string | null | undefined) {
  if (tier === 'PLUS')
    return 'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue';
  if (tier === 'PRO')
    return 'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple';
  if (tier === 'ENTERPRISE')
    return 'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber';
  return 'border-muted-foreground/30 bg-muted/50 text-muted-foreground';
}

function accentClass(id: string) {
  const palette = [
    'bg-dynamic-blue',
    'bg-dynamic-purple',
    'bg-dynamic-amber',
    'bg-dynamic-green',
    'bg-dynamic-red',
  ];
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % palette.length;
  return palette[hash] ?? palette[0];
}

function matchesQuery(workspace: InternalApiWorkspaceSummary, query: string) {
  if (!query) return true;
  return [workspace.name, workspace.id, workspace.tier].some((value) =>
    value?.toLocaleLowerCase().includes(query)
  );
}

function byIds(
  ids: string[],
  source: InternalApiWorkspaceSummary[]
): InternalApiWorkspaceSummary[] {
  const byId = new Map(source.map((workspace) => [workspace.id, workspace]));
  return ids.flatMap((id) => {
    const workspace = byId.get(id);
    return workspace ? [workspace] : [];
  });
}

function WorkspaceName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setTruncated(node.scrollWidth > node.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [name]);
  const text = (
    <span ref={ref} className="block min-w-0 truncate font-medium">
      {name}
    </span>
  );
  if (!truncated) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

function isSearchTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.dataset.testid === 'workspace-picker-search'
  );
}

function choiceButtons(list: HTMLElement | null) {
  return Array.from(
    list?.querySelectorAll<HTMLElement>(
      '[data-workspace-choice]:not(:disabled)'
    ) ?? []
  );
}

export function WorkspacePickerDialog({
  open,
  onOpenChange,
  trigger,
  workspaces,
  currentId,
  defaultId,
  visibility,
  preferences,
  onSelect,
  onDefault,
  onCreate,
  onJoin,
  onRetryList,
  listLoading = false,
  listError,
  invitations,
  invitationCount = 0,
  presentation = 'dropdown',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  workspaces: InternalApiWorkspaceSummary[];
  currentId?: string;
  defaultId?: string | null;
  visibility: Visibility;
  preferences?: PickerPreferences;
  onSelect: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault?: (id: string) => void;
  onCreate?: () => void;
  onJoin?: () => void;
  onRetryList?: () => void;
  listLoading?: boolean;
  listError?: Error | null;
  invitations?: ReactNode;
  invitationCount?: number;
  presentation?: 'fullscreen' | 'dropdown';
}) {
  const t = useTranslations('common');
  const listT = useTranslations('command_launcher');
  const variant = usePickerVariant();
  const titleId = useId();
  const listId = useId();
  const hiddenPanelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const localPreferences = useWorkspacePickerPreferences(visibility.actorId);
  const history = preferences ?? localPreferences;
  const [search, setSearch] = useState('');
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const hiddenIds = new Set(visibility.hiddenIds);
  const visible = workspaces.filter(
    (workspace) =>
      !hiddenIds.has(workspace.id) && matchesQuery(workspace, query)
  );
  const hidden = workspaces
    .filter(
      (workspace) =>
        hiddenIds.has(workspace.id) && matchesQuery(workspace, query)
    )
    .sort(
      (a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id)
    );
  const pinned = byIds(history.pinned, visible);
  const recent = byIds(
    history.recent.filter((id) => !history.pinned.includes(id)),
    visible
  );
  const placed = new Set(
    [...pinned, ...recent].map((workspace) => workspace.id)
  );
  const rest = visible
    .filter((workspace) => !placed.has(workspace.id))
    .sort(
      (a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id)
    );
  const rows = [...pinned, ...recent, ...rest, ...(hiddenOpen ? hidden : [])];
  const firstId = rows[0]?.id ?? '';
  if (
    open &&
    activeId !== firstId &&
    !rows.some((workspace) => workspace.id === activeId)
  ) {
    setActiveId(firstId);
  }

  useEffect(() => {
    if (open) return;
    setSearch('');
    setHiddenOpen(false);
  }, [open]);

  const choose = useCallback(
    (workspace: InternalApiWorkspaceSummary) => {
      history.record(workspace.id);
      onSelect(workspace);
    },
    [history, onSelect]
  );

  function moveFocus(event: ReactKeyboardEvent<HTMLElement>) {
    const buttons = choiceButtons(listRef.current);
    if (!buttons.length) return;
    if (
      isSearchTarget(event.target) &&
      (event.key === 'Home' || event.key === 'End')
    ) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const currentChoice = (
      document.activeElement as HTMLElement | null
    )?.closest('[data-workspace-choice]');
    const index = buttons.findIndex((button) => button === currentChoice);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % buttons.length
            : (index <= 0 ? buttons.length : index) - 1;
    const target = buttons[next];
    const id = target?.dataset.workspaceId;
    if (id) setActiveId(id);
    target?.focus();
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const workspace = rows.find((item) => item.id === activeId) ?? rows[0];
      if (workspace) choose(workspace);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.stopPropagation();
    moveFocus(event);
  }

  function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isSearchTarget(event.target)) return;
    if (event.key === 'Enter') {
      const choice = (event.target as HTMLElement | null)?.closest(
        '[data-workspace-choice]'
      );
      if (!choice) return;
      if ((event.target as HTMLElement).closest('[data-picker-action]')) return;
      event.preventDefault();
      const id = choice.getAttribute('data-workspace-id');
      const workspace = rows.find((item) => item.id === id);
      if (workspace) choose(workspace);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    moveFocus(event);
  }

  const failed = Boolean(
    listError || visibility.isError || visibility.updateError
  );
  const waiting =
    !visibility.known ||
    ((listLoading || Boolean(listError)) && workspaces.length === 0);
  const showSkeleton = waiting && !listError && !visibility.isError;
  const showList = !waiting;
  const shortcut =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
      ? '⌘⇧K'
      : 'Ctrl+Shift+K';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        aria-labelledby={titleId}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          variant === 'dialog' &&
            'max-h-[min(40rem,calc(100vh-2rem))] sm:max-w-xl'
        )}
        data-picker-presentation={presentation}
        data-testid="workspace-picker-dialog"
        data-variant={variant}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const scope =
            event.currentTarget instanceof HTMLElement
              ? event.currentTarget
              : document;
          scope
            .querySelector<HTMLInputElement>(
              '[data-testid="workspace-picker-search"]'
            )
            ?.focus();
        }}
        presentation={variant === 'sheet' ? 'fullscreen' : 'default'}
        role="dialog"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogTitle id={titleId} className="text-base">
              {t('select_workspace')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('search_workspace')}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              {shortcut}
            </kbd>
            <DialogClose asChild>
              <Button
                aria-label={t('close')}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </DialogClose>
          </div>
        </div>
        <Command
          className="min-h-0 flex-1 bg-transparent"
          loop
          onKeyDown={onListKeyDown}
          shouldFilter={false}
          value={activeId}
          onValueChange={(value) => {
            if (value) setActiveId(value);
          }}
        >
          <CommandInput
            aria-controls={listId}
            aria-label={t('search_workspace')}
            autoFocus
            data-testid="workspace-picker-search"
            onKeyDown={onSearchKeyDown}
            onValueChange={setSearch}
            placeholder={t('search_workspace')}
            value={search}
          />
          {failed && (
            <div
              className="flex items-center gap-3 border-b px-4 py-2"
              role="alert"
            >
              <p className="min-w-0 flex-1 text-sm">
                {listError
                  ? listT('error_workspaces')
                  : visibility.updateError
                    ? t('hidden_workspaces_update_error')
                    : t('hidden_workspaces_load_error')}
              </p>
              <Button
                data-testid="workspace-picker-retry"
                onClick={() => {
                  void visibility.refetch();
                  onRetryList?.();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('retry')}
              </Button>
            </div>
          )}
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto',
              variant === 'sheet' ? 'pb-2' : 'max-h-[min(24rem,50vh)]'
            )}
            ref={listRef}
          >
            {showSkeleton ? (
              <div className="space-y-2 p-3" role="status">
                <p className="px-1 text-muted-foreground text-sm">
                  {t('loading')}
                </p>
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    aria-hidden="true"
                    className="h-12 rounded-lg bg-muted motion-safe:animate-pulse"
                    key={index}
                  />
                ))}
              </div>
            ) : null}
            {showList ? (
              <>
                <CommandList
                  className="max-h-none overflow-visible"
                  id={listId}
                  label={t('select_workspace')}
                >
                  <PickerSection
                    activeId={activeId}
                    currentId={currentId}
                    defaultId={defaultId}
                    heading={t('picker_pinned')}
                    id="pinned"
                    onChoose={choose}
                    onDefault={onDefault}
                    onTogglePin={history.togglePin}
                    pinnedIds={history.pinned}
                    rows={pinned}
                    setHidden={visibility.setHidden}
                    t={t}
                    visibility={visibility}
                  />
                  <PickerSection
                    activeId={activeId}
                    currentId={currentId}
                    defaultId={defaultId}
                    heading={t('picker_recent')}
                    id="recent"
                    onChoose={choose}
                    onDefault={onDefault}
                    onTogglePin={history.togglePin}
                    pinnedIds={history.pinned}
                    rows={recent}
                    setHidden={visibility.setHidden}
                    t={t}
                    visibility={visibility}
                  />
                  <PickerSection
                    activeId={activeId}
                    currentId={currentId}
                    defaultId={defaultId}
                    heading={t('picker_section_all')}
                    id="all"
                    onChoose={choose}
                    onDefault={onDefault}
                    onTogglePin={history.togglePin}
                    pinnedIds={history.pinned}
                    rows={rest}
                    setHidden={visibility.setHidden}
                    t={t}
                    visibility={visibility}
                  />
                  {!pinned.length && !recent.length && !rest.length ? (
                    <p
                      className="px-3 py-8 text-center text-muted-foreground text-sm"
                      role="status"
                    >
                      {query
                        ? t('no_workspace_found')
                        : workspaces.length
                          ? t('all_workspaces_hidden')
                          : t('no_workspace_found')}
                    </p>
                  ) : null}
                </CommandList>
                <div
                  className="border-t"
                  data-testid="workspace-picker-section-hidden"
                >
                  <button
                    aria-controls={hiddenPanelId}
                    aria-expanded={hiddenOpen}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="workspace-picker-hidden-toggle"
                    onClick={() => setHiddenOpen((current) => !current)}
                    type="button"
                  >
                    <ChevronRight
                      className={cn(
                        'size-4 transition-transform',
                        hiddenOpen && 'rotate-90'
                      )}
                    />
                    <span className="flex-1">
                      {t('hidden_workspaces')} ({visibility.hiddenIds.length})
                    </span>
                  </button>
                  {hiddenOpen ? (
                    <div id={hiddenPanelId}>
                      {hidden.length ? (
                        <PickerSection
                          activeId={activeId}
                          currentId={currentId}
                          defaultId={defaultId}
                          hidden
                          id="hidden-rows"
                          onChoose={choose}
                          onDefault={onDefault}
                          onTogglePin={history.togglePin}
                          pinnedIds={history.pinned}
                          rows={hidden}
                          setHidden={visibility.setHidden}
                          t={t}
                          visibility={visibility}
                        />
                      ) : (
                        <p
                          className="px-3 py-4 text-muted-foreground text-sm"
                          role="status"
                        >
                          {t('hidden_workspaces_empty')}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </Command>
        {invitations ? (
          <div
            className="max-h-40 shrink-0 overflow-y-auto border-t"
            data-testid={
              invitationCount > 0
                ? 'workspace-picker-section-invitations'
                : undefined
            }
          >
            {invitations}
          </div>
        ) : null}
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t bg-muted/40 p-3">
          <Button
            className="w-full"
            data-testid="workspace-picker-join"
            onClick={onJoin}
            type="button"
            variant="outline"
          >
            <UserPlus />
            {t('join_workspace')}
          </Button>
          {onCreate ? (
            <Button
              className="w-full"
              data-testid="workspace-picker-create"
              onClick={onCreate}
              type="button"
            >
              <Plus />
              {t('create_workspace')}
            </Button>
          ) : (
            <span />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickerSection({
  id,
  heading,
  rows,
  hidden = false,
  activeId,
  currentId,
  defaultId,
  pinnedIds,
  onChoose,
  onDefault,
  onTogglePin,
  setHidden,
  visibility,
  t,
}: {
  id: 'pinned' | 'recent' | 'all' | 'hidden-rows';
  heading?: string;
  rows: InternalApiWorkspaceSummary[];
  hidden?: boolean;
  activeId: string;
  currentId?: string;
  defaultId?: string | null;
  pinnedIds: string[];
  onChoose: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault?: (id: string) => void;
  onTogglePin: (id: string) => void;
  setHidden: Visibility['setHidden'];
  visibility: Visibility;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!rows.length) return null;
  const testId =
    id === 'hidden-rows' ? undefined : `workspace-picker-section-${id}`;
  return (
    <CommandGroup data-testid={testId} heading={heading}>
      {rows.map((workspace) => (
        <WorkspaceRow
          active={workspace.id === activeId}
          current={workspace.id === currentId}
          defaultId={defaultId}
          hidden={hidden}
          key={workspace.id}
          onChoose={onChoose}
          onDefault={onDefault}
          onTogglePin={onTogglePin}
          pending={visibility.pending.has(workspace.id)}
          pinned={pinnedIds.includes(workspace.id)}
          setHidden={setHidden}
          showPin={Boolean(visibility.actorId)}
          t={t}
          workspace={workspace}
        />
      ))}
    </CommandGroup>
  );
}

function WorkspaceRow({
  workspace,
  active,
  current,
  hidden,
  defaultId,
  showPin,
  pending,
  pinned,
  onChoose,
  onDefault,
  onTogglePin,
  setHidden,
  t,
}: {
  workspace: InternalApiWorkspaceSummary;
  active: boolean;
  current: boolean;
  hidden: boolean;
  defaultId?: string | null;
  showPin: boolean;
  pending: boolean;
  pinned: boolean;
  onChoose: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault?: (id: string) => void;
  onTogglePin: (id: string) => void;
  setHidden: Visibility['setHidden'];
  t: ReturnType<typeof useTranslations>;
}) {
  const name = workspace.name || workspace.id;
  const tier = workspace.tier || 'FREE';
  return (
    <CommandItem
      aria-selected={active}
      className="group items-center gap-3 px-2 py-2 aria-selected:bg-accent"
      data-current={current ? 'true' : undefined}
      data-workspace-choice
      data-workspace-id={workspace.id}
      data-testid={`workspace-picker-row-${workspace.id}`}
      onSelect={() => onChoose(workspace)}
      role="option"
      tabIndex={-1}
      title={name}
      value={workspace.id}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          accentClass(workspace.id)
        )}
      />
      <WorkspaceIcon
        avatarUrl={workspace.avatar_url}
        className="h-8 max-h-8 min-h-8 w-8 min-w-8 max-w-8"
        name={name}
      />
      <span className="min-w-0 flex-1">
        <WorkspaceName name={name} />
        {workspace.access_type === 'guest' ? (
          <span className="block truncate text-muted-foreground text-xs">
            {t('guest_access')}
          </span>
        ) : null}
      </span>
      <Badge
        className={cn('h-5 px-1.5 font-medium text-[10px]', tierClass(tier))}
        variant="outline"
      >
        {tier}
      </Badge>
      {current ? (
        <Check
          aria-label={t('current_workspace')}
          className="size-4 text-primary"
        />
      ) : (
        <span className="size-4" />
      )}
      <span className="picker-actions absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-md bg-popover/95 px-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100">
        {showPin ? (
          <RowAction
            label={`${t(pinned ? 'picker_unpin' : 'picker_pin')}: ${name}`}
            pressed={pinned}
            onClick={() => onTogglePin(workspace.id)}
          >
            <Pin className={pinned ? 'fill-current' : ''} />
          </RowAction>
        ) : null}
        {!hidden && workspace.access_type !== 'guest' && onDefault ? (
          <RowAction
            disabled={workspace.id === defaultId}
            label={t('default_workspace')}
            onClick={() => onDefault(workspace.id)}
          >
            <Star
              className={workspace.id === defaultId ? 'fill-current' : ''}
            />
          </RowAction>
        ) : null}
        <RowAction
          disabled={pending}
          label={`${t(hidden ? 'restore_workspace' : 'hide_workspace')}: ${name}`}
          onClick={() => {
            void setHidden(workspace.id, !hidden).catch(() => {});
          }}
        >
          {hidden ? <Eye /> : <EyeOff />}
        </RowAction>
      </span>
    </CommandItem>
  );
}

function RowAction({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={pressed}
      data-picker-action
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="size-7"
      size="icon"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
