/**
 * Shared table class tokens so the runs table and the usage breakdowns read as
 * the same component family.
 */
export const tableClasses = {
  bodyRow:
    'border-b transition-colors last:border-0 hover:bg-muted/40 data-[state=open]:bg-muted/40',
  cell: 'px-3 py-2.5 align-middle',
  head: 'sticky top-0 z-10 border-b bg-muted/60 backdrop-blur',
  headCell:
    'px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-[0.06em] whitespace-nowrap',
  headCellNumeric:
    'px-3 py-2 text-right font-medium text-muted-foreground text-xs uppercase tracking-[0.06em] whitespace-nowrap',
  numericCell: 'px-3 py-2.5 text-right align-middle tabular-nums',
  scroller: 'overflow-x-auto',
  table: 'w-full text-sm',
} as const;
