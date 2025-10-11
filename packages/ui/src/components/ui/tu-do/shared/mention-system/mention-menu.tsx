import {
    Box,
    BriefcaseBusiness,
    Calendar,
    CircleCheck,
    Loader2,
    User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
// @ts-expect-error - Bun types issue with react-dom subpath
import { createPortal } from 'react-dom';
import type { MentionOption } from './types';
import { mentionGroupOrder, mentionTypeStyles } from './types';

interface MentionMenuProps {
  isOpen: boolean;
  position: { left: number; top: number } | null;
  options: MentionOption[];
  highlightIndex: number;
  isLoading?: boolean;
  query?: string;
  onSelect: (option: MentionOption) => void;
  onHighlightChange: (index: number) => void;
  listRef?: React.RefObject<HTMLDivElement | null>;
}

export function MentionMenu({
  isOpen,
  position,
  options,
  highlightIndex,
  isLoading = false,
  query = '',
  onSelect,
  onHighlightChange,
  listRef,
}: MentionMenuProps) {
  if (!isOpen || !position || typeof window === 'undefined') {
    return null;
  }

  const groups = mentionGroupOrder
    .map((group) => ({
      ...group,
      options: options.filter((option) => option.type === group.type),
    }))
    .filter((group) => group.options.length > 0);

  return createPortal(
    <div
      role="dialog"
      className="pointer-events-auto fixed z-[200] flex w-[360px] flex-col overflow-hidden rounded-lg border border-dynamic-border bg-popover/95 shadow-xl backdrop-blur"
      style={{
        top: position.top,
        left: position.left,
      }}
      onPointerDownCapture={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex-shrink-0 border-dynamic-border/60 border-b px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Mention people, workspaces, projects, dates, or tasks
      </div>
      {isLoading && (
        <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching latest context…
        </div>
      )}
      <div
        ref={listRef}
        className="scrollbar-thin max-h-80 flex-1 overflow-y-auto overscroll-contain py-1"
        style={{ maxHeight: 320 }}
      >
        {options.length === 0 ? (
          <div className="px-3 py-3 text-muted-foreground text-sm">
            {query
              ? 'No matches found. Try a different keyword.'
              : 'Start typing to mention teammates, workspaces, projects, dates, or tasks.'}
          </div>
        ) : (
          (() => {
            let optionCursor = -1;
            return groups.map((group) => (
              <div key={group.type} className="py-1">
                <div className="px-3 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                  {group.title}
                </div>
                {group.options.map((option) => {
                  optionCursor += 1;
                  const currentIndex = optionCursor;
                  const isActive = currentIndex === highlightIndex;
                  const typeMeta = mentionTypeStyles[option.type];
                  const fallbackGlyph =
                    option.type === 'user' || option.type === 'external-user'
                      ? (option.label || '')
                          .split(/\s+/)
                          .map((part) => part?.[0]?.toUpperCase() ?? '')
                          .join('')
                          .slice(0, 2) || typeMeta.avatarFallback
                      : typeMeta.avatarFallback;
                  const badgeLabel =
                    option.type === 'user'
                      ? 'Person'
                      : option.type === 'workspace'
                        ? 'Workspace'
                        : option.type === 'project'
                          ? 'Project'
                          : option.type === 'date'
                            ? 'Date'
                            : option.type === 'external-user'
                              ? 'Guest'
                              : 'Task';

                  return (
                    <button
                      data-mention-item={currentIndex}
                      key={`${option.type}-${option.id}`}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                        isActive
                          ? 'bg-dynamic-blue/20 text-foreground ring-1 ring-dynamic-blue/40'
                          : 'text-muted-foreground hover:bg-dynamic-surface/70 hover:text-foreground'
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(option);
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(option);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelect(option);
                        }
                      }}
                      onMouseEnter={() => onHighlightChange(currentIndex)}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border font-semibold text-xs uppercase',
                          typeMeta.avatarClass,
                          option.avatarUrl ? 'p-0' : 'px-1'
                        )}
                      >
                        {option.avatarUrl ? (
                          <Image
                            src={option.avatarUrl}
                            alt={option.label}
                            width={28}
                            height={28}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : option.type === 'workspace' ? (
                          <BriefcaseBusiness className="h-3.5 w-3.5" />
                        ) : option.type === 'project' ? (
                          <Box className="h-3.5 w-3.5" />
                        ) : option.type === 'task' ? (
                          <CircleCheck className="h-3.5 w-3.5" />
                        ) : option.type === 'date' ? (
                          <Calendar className="h-3.5 w-3.5" />
                        ) : option.type === 'external-user' ? (
                          <User className="h-3.5 w-3.5" />
                        ) : (
                          <span className="truncate">{fallbackGlyph}</span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-foreground text-sm">
                          {option.label}
                        </span>
                        {option.subtitle && (
                          <span className="truncate text-muted-foreground text-xs">
                            {option.subtitle}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 font-semibold text-[10px] uppercase tracking-wide',
                          typeMeta.badgeClass
                        )}
                      >
                        {badgeLabel}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            ));
          })()
        )}
      </div>
    </div>,
    document.body
  );
}
