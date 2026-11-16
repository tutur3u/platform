import type { SorbetPreset } from '../sorbet-theme';

/**
 * A miniature page painted with one Sorbet palette's own tokens: a card with
 * two text lines, a primary pill and an accent pill. `data-sorbet-preview`
 * scopes the palette to this element, so it renders the same in either mode
 * and whether or not Sorbet is on. `min-w-0` lets two sides share a narrow
 * tile, such as the System tile at phone width, instead of overflowing it.
 */
export function SorbetPresetSwatch({
  preset,
  mode,
}: {
  preset: SorbetPreset;
  mode: 'light' | 'dark';
}) {
  return (
    <div
      data-sorbet-preview={preset}
      data-sorbet-preview-mode={mode}
      className="flex min-w-0 flex-1 flex-col gap-1.5 bg-background p-2"
    >
      <div className="flex flex-col gap-1 rounded-md border bg-card p-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-foreground" />
        <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground" />
      </div>
      <div className="flex items-center gap-1">
        <div className="h-3 w-8 rounded-full bg-primary" />
        <div className="h-3 w-5 rounded-full bg-accent" />
      </div>
    </div>
  );
}
