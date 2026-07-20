import { ArrowRight, ExternalLink, Search, Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
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
    <div
      className="flex shrink-0 items-center gap-1.5"
      data-slot="apps-launcher-toolbar"
    >
      <div className="hidden items-center gap-3 md:flex">
        <SearchField
          onQueryChange={onQueryChange}
          query={query}
          searchLabel={searchLabel}
        />
        <div className="flex items-center gap-2.5">
          <span className="whitespace-nowrap font-medium text-muted-foreground text-xs">
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

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={searchLabel}
                className={cn(
                  'size-8 shadow-none md:hidden',
                  query && 'border-foreground/20 bg-muted text-foreground'
                )}
                data-slot="apps-launcher-search-trigger"
                size="icon"
                type="button"
                variant="outline"
              >
                <Search aria-hidden className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{searchLabel}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-[min(20rem,calc(100vw-2rem))] p-2"
          sideOffset={8}
        >
          <SearchField
            mobile
            onQueryChange={onQueryChange}
            query={query}
            searchLabel={searchLabel}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={openOptionsLabel}
                className="size-8 shadow-none md:hidden"
                data-slot="apps-launcher-preference-trigger"
                size="icon"
                type="button"
                variant="outline"
              >
                <Settings2 aria-hidden className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{openOptionsLabel}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-[min(18rem,calc(100vw-2rem))] space-y-2.5 p-3"
          sideOffset={8}
        >
          <span className="font-medium text-muted-foreground text-xs">
            {openModeLabel}
          </span>
          <OpenModeControl
            fill
            currentLabel={currentLabel}
            label={openOptionsLabel}
            mode={mode}
            newLabel={newLabel}
            onModeChange={onModeChange}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SearchField({
  mobile = false,
  onQueryChange,
  query,
  searchLabel,
}: {
  mobile?: boolean;
  onQueryChange: (query: string) => void;
  query: string;
  searchLabel: string;
}) {
  return (
    <label className={cn('relative block', mobile ? 'w-full' : 'w-44 lg:w-72')}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label={searchLabel}
        className="h-9 bg-background pl-9 shadow-none"
        data-mobile={mobile || undefined}
        data-slot="apps-launcher-search"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={searchLabel}
        type="search"
        value={query}
      />
    </label>
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
  fill = false,
  label,
  mode,
  newLabel,
  onModeChange,
}: {
  currentLabel: string;
  fill?: boolean;
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
        className={cn(
          'gap-1 rounded-lg border bg-background p-0.5',
          fill && 'grid w-full grid-cols-2'
        )}
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
          className={cn(
            'data-[selected=true]:!border-foreground/20 data-[selected=true]:!bg-foreground data-[selected=true]:!text-background h-7 min-w-7 gap-1.5 rounded-md border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:shadow-xs',
            fill && 'w-full'
          )}
          data-selected={mode === 'current-tab'}
          value="current-tab"
        >
          <ArrowRight className="size-3.5" />
          <span>{currentLabel}</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label={newLabel}
          className={cn(
            'data-[selected=true]:!border-foreground/20 data-[selected=true]:!bg-foreground data-[selected=true]:!text-background h-7 min-w-7 gap-1.5 rounded-md border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:shadow-xs',
            fill && 'w-full'
          )}
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
