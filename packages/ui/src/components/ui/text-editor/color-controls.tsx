import type { Editor } from '@tiptap/react';
import { Highlighter, Paintbrush, TextIcon, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface EditorColorSwatch {
  name: string;
  foreground: string;
  background: string;
}

const EDITOR_COLOR_SWATCHES: EditorColorSwatch[] = [
  {
    name: 'Yellow',
    foreground: 'var(--yellow)',
    background: 'var(--calendar-bg-yellow)',
  },
  {
    name: 'Orange',
    foreground: 'var(--orange)',
    background: 'var(--calendar-bg-orange)',
  },
  {
    name: 'Red',
    foreground: 'var(--red)',
    background: 'var(--calendar-bg-red)',
  },
  {
    name: 'Pink',
    foreground: 'var(--pink)',
    background: 'var(--calendar-bg-pink)',
  },
  {
    name: 'Purple',
    foreground: 'var(--purple)',
    background: 'var(--calendar-bg-purple)',
  },
  {
    name: 'Blue',
    foreground: 'var(--blue)',
    background: 'var(--calendar-bg-blue)',
  },
  {
    name: 'Green',
    foreground: 'var(--green)',
    background: 'var(--calendar-bg-green)',
  },
  {
    name: 'Gray',
    foreground: 'var(--gray)',
    background: 'var(--calendar-bg-gray)',
  },
];

type HighlightAttributes = {
  color: string;
  textColor?: string;
};

type TextStyleAttributes = {
  color?: string | null;
  backgroundColor?: string | null;
};

interface TextEditorColorControlsProps {
  editor: Editor | null;
}

export function TextEditorColorControls({
  editor,
}: TextEditorColorControlsProps) {
  if (!editor) return null;

  const getAttributes = editor.getAttributes?.bind(editor);
  const highlightAttributes = (getAttributes?.('highlight') ?? {}) as {
    color?: string | null;
    textColor?: string | null;
  };
  const textStyleAttributes = (getAttributes?.('textStyle') ??
    {}) as TextStyleAttributes;

  const textColor = textStyleAttributes.color ?? null;
  const backgroundColor = textStyleAttributes.backgroundColor ?? null;
  const highlightColor = highlightAttributes.color ?? null;
  const highlightTextColor = highlightAttributes.textColor ?? null;

  return (
    <>
      <ColorControlPopover
        active={editor.isActive('highlight')}
        clearLabel="Clear highlight"
        indicatorBackground={highlightColor}
        indicatorColor={highlightTextColor}
        label="Highlight color"
        icon={<Highlighter className="size-4" />}
        onClear={() => editor.chain().focus().unsetHighlight().run()}
        swatchKind="highlight"
        onSelect={(swatch) => {
          const attributes: HighlightAttributes = {
            color: swatch.background,
            textColor: swatch.foreground,
          };

          editor.chain().focus().setHighlight(attributes).run();
        }}
        isSwatchActive={(swatch) =>
          editor.isActive('highlight', {
            color: swatch.background,
            textColor: swatch.foreground,
          })
        }
      />
      <ColorControlPopover
        active={Boolean(textColor)}
        clearLabel="Clear text color"
        indicatorColor={textColor}
        label="Text color"
        icon={<TextIcon className="size-4" />}
        onClear={() => editor.chain().focus().unsetColor().run()}
        swatchKind="text"
        onSelect={(swatch) =>
          editor.chain().focus().setColor(swatch.foreground).run()
        }
        isSwatchActive={(swatch) =>
          editor.isActive('textStyle', { color: swatch.foreground })
        }
      />
      <ColorControlPopover
        active={Boolean(backgroundColor)}
        clearLabel="Clear background color"
        indicatorBackground={backgroundColor}
        label="Background color"
        icon={<Paintbrush className="size-4" />}
        onClear={() => editor.chain().focus().unsetBackgroundColor().run()}
        swatchKind="background"
        onSelect={(swatch) =>
          editor.chain().focus().setBackgroundColor(swatch.background).run()
        }
        isSwatchActive={(swatch) =>
          editor.isActive('textStyle', {
            backgroundColor: swatch.background,
          })
        }
      />
    </>
  );
}

interface ColorControlPopoverProps {
  active: boolean;
  clearLabel: string;
  icon: React.ReactNode;
  indicatorBackground?: string | null;
  indicatorColor?: string | null;
  isSwatchActive: (swatch: EditorColorSwatch) => boolean;
  label: string;
  onClear: () => void;
  onSelect: (swatch: EditorColorSwatch) => void;
  swatchKind: 'highlight' | 'text' | 'background';
}

function ColorControlPopover({
  active,
  clearLabel,
  icon,
  indicatorBackground,
  indicatorColor,
  isSwatchActive,
  label,
  onClear,
  onSelect,
  swatchKind,
}: ColorControlPopoverProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={label}
              aria-pressed={active}
              className={cn(
                'relative h-8 w-8 rounded-md border border-transparent transition-colors hover:bg-dynamic-surface/80',
                active &&
                  'border-foreground/10 bg-dynamic-surface/80 text-foreground'
              )}
              onMouseDown={(event) => event.preventDefault()}
              size="icon"
              type="button"
              variant="ghost"
            >
              {icon}
              <span
                className="pointer-events-none absolute right-1 bottom-1 h-1.5 w-4 rounded-full border border-background"
                style={{
                  backgroundColor:
                    indicatorBackground ?? indicatorColor ?? 'transparent',
                }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="space-y-2">
          <div className="font-medium text-muted-foreground text-xs">
            {label}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {EDITOR_COLOR_SWATCHES.map((swatch) => (
              <SwatchButton
                active={isSwatchActive(swatch)}
                key={`${swatchKind}-${swatch.name}`}
                swatch={swatch}
                swatchKind={swatchKind}
                onSelect={() => onSelect(swatch)}
              />
            ))}
          </div>
          <Button
            className="h-8 w-full justify-start px-2 text-xs"
            onClick={onClear}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
            variant="ghost"
          >
            <X className="mr-1.5 size-3.5" />
            {clearLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SwatchButtonProps {
  active: boolean;
  onSelect: () => void;
  swatch: EditorColorSwatch;
  swatchKind: 'highlight' | 'text' | 'background';
}

function SwatchButton({
  active,
  onSelect,
  swatch,
  swatchKind,
}: SwatchButtonProps) {
  const backgroundColor =
    swatchKind === 'text' ? 'var(--background)' : swatch.background;
  const color =
    swatchKind === 'background' ? 'var(--foreground)' : swatch.foreground;

  return (
    <Button
      aria-label={`${swatch.name} ${swatchKind}`}
      className={cn(
        'h-8 w-8 rounded-md border border-dynamic-border p-0 transition-all hover:scale-105',
        active &&
          'ring-2 ring-foreground/30 ring-offset-1 ring-offset-background'
      )}
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      size="icon"
      style={{ backgroundColor, color }}
      type="button"
      variant="ghost"
    >
      {swatchKind === 'text' ? (
        <TextIcon className="size-4" />
      ) : (
        <span
          className="size-4 rounded-sm border border-foreground/10"
          style={{
            backgroundColor: swatch.background,
          }}
        />
      )}
    </Button>
  );
}
