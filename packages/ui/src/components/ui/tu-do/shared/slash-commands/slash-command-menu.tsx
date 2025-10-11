import { cn } from '@tuturuuu/utils/format';
// @ts-expect-error - Bun types issue with react-dom subpath
import { createPortal } from 'react-dom';
import type { SlashCommandDefinition } from './definitions';

interface SlashCommandMenuProps {
  isOpen: boolean;
  position: { left: number; top: number } | null;
  commands: SlashCommandDefinition[];
  highlightIndex: number;
  onSelect: (command: SlashCommandDefinition) => void;
  onHighlightChange: (index: number) => void;
  listRef?: React.RefObject<HTMLDivElement | null>;
}

export function SlashCommandMenu({
  isOpen,
  position,
  commands,
  highlightIndex,
  onSelect,
  onHighlightChange,
  listRef,
}: SlashCommandMenuProps) {
  if (!isOpen || !position || typeof window === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      className="pointer-events-auto fixed z-[200] w-[304px] overflow-hidden rounded-lg border border-dynamic-border bg-popover/95 shadow-xl backdrop-blur"
      style={{
        top: position.top,
        left: position.left,
      }}
      onPointerDownCapture={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="border-dynamic-border/60 border-b px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Slash commands
      </div>
      <div
        ref={listRef}
        className="scrollbar-thin max-h-72 overflow-y-auto overscroll-contain py-1"
        style={{ maxHeight: 288 }}
      >
        {commands.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground text-sm">
            No commands found
          </div>
        ) : (
          commands.map((command, index) => {
            const Icon = command.icon;
            const isActive = index === highlightIndex;
            return (
              <button
                data-slash-item={index}
                key={command.id}
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
                  onSelect(command);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(command);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect(command);
                  }
                }}
                onMouseEnter={() => onHighlightChange(index)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{command.label}</span>
                  {command.description && (
                    <span className="text-muted-foreground/80 text-xs">
                      {command.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}
