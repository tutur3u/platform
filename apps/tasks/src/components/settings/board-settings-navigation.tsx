import { LayoutGrid, Settings2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';

interface BoardSettingsNavigationProps {
  boardDescription: string;
  boardDetailsLabel: string;
  boardLayoutLabel: string;
  boardName: string | null;
  layoutTitle: string;
  listCount: number;
  ticketPrefix: string | null;
}

export function BoardSettingsNavigation({
  boardDescription,
  boardDetailsLabel,
  boardLayoutLabel,
  boardName,
  layoutTitle,
  listCount,
  ticketPrefix,
}: BoardSettingsNavigationProps) {
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold">{boardName}</p>
          <p className="text-muted-foreground text-sm">{boardDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ticketPrefix ? (
            <Badge variant="outline">{ticketPrefix}</Badge>
          ) : null}
          <Badge title={layoutTitle} variant="secondary">
            <LayoutGrid className="mr-1 size-3" />
            {listCount}
          </Badge>
        </div>
      </div>

      <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
        <TabsTrigger className="gap-2 rounded-lg py-2.5" value="setup">
          <Settings2 className="size-4" />
          {boardDetailsLabel}
        </TabsTrigger>
        <TabsTrigger className="gap-2 rounded-lg py-2.5" value="layout">
          <LayoutGrid className="size-4" />
          {boardLayoutLabel}
          <Badge className="ml-1 h-5 px-1.5 text-[10px]" variant="outline">
            {listCount}
          </Badge>
        </TabsTrigger>
      </TabsList>
    </>
  );
}
