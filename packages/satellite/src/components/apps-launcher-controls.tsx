import { ArrowRight, ExternalLink, Search } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import type { AppOpenMode } from './apps-launcher-catalog';

export function AppsLauncherToolbar({
  currentLabel,
  mode,
  newLabel,
  onModeChange,
  onQueryChange,
  openModeLabel,
  openOptionsLabel,
  query,
  searchLabel,
}: {
  currentLabel: string;
  mode: AppOpenMode;
  newLabel: string;
  onModeChange: (mode: AppOpenMode) => void;
  onQueryChange: (query: string) => void;
  openModeLabel: string;
  openOptionsLabel: string;
  query: string;
  searchLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <label className="relative block w-full sm:max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={searchLabel}
          className="h-9 bg-background pl-9 shadow-none"
          data-slot="apps-launcher-search"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchLabel}
          type="search"
          value={query}
        />
      </label>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="font-medium text-muted-foreground text-xs">
          {openModeLabel}
        </span>
        <OpenModeControl
          currentLabel={currentLabel}
          label={openOptionsLabel}
          mode={mode}
          newLabel={newLabel}
          onModeChange={onModeChange}
        />
      </div>
    </div>
  );
}

export function LauncherMark() {
  return (
    <div
      aria-hidden="true"
      className="grid size-9 shrink-0 grid-cols-2 gap-1 rounded-xl border bg-background p-1.5 shadow-xs"
      data-slot="apps-launcher-mark"
    >
      <span className="rounded-[4px] bg-dynamic-blue" />
      <span className="rounded-[4px] bg-dynamic-green" />
      <span className="rounded-[4px] bg-dynamic-orange" />
      <span className="rounded-[4px] bg-dynamic-purple" />
    </div>
  );
}

function OpenModeControl({
  currentLabel,
  label,
  mode,
  newLabel,
  onModeChange,
}: {
  currentLabel: string;
  label: string;
  mode: AppOpenMode;
  newLabel: string;
  onModeChange: (mode: AppOpenMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center"
      data-slot="apps-launcher-open-mode"
    >
      <ToggleGroup
        aria-label={label}
        className="gap-1 rounded-lg border bg-background p-0.5"
        onValueChange={(value) => {
          if (value === 'current-tab' || value === 'new-tab') {
            onModeChange(value);
          }
        }}
        type="single"
        value={mode}
      >
        <ToggleGroupItem
          aria-label={currentLabel}
          className="data-[selected=true]:!border-foreground/20 data-[selected=true]:!bg-foreground data-[selected=true]:!text-background h-7 min-w-7 gap-1.5 rounded-md border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:shadow-xs"
          data-selected={mode === 'current-tab'}
          value="current-tab"
        >
          <ArrowRight className="size-3.5" />
          <span>{currentLabel}</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label={newLabel}
          className="data-[selected=true]:!border-foreground/20 data-[selected=true]:!bg-foreground data-[selected=true]:!text-background h-7 min-w-7 gap-1.5 rounded-md border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:shadow-xs"
          data-selected={mode === 'new-tab'}
          value="new-tab"
        >
          <ExternalLink className="size-3.5" />
          <span>{newLabel}</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
