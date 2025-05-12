import { Separator } from '@tuturuuu/ui/separator';

export default function Loading() {
  return (
    <>
      <div className="border-border bg-foreground/5 h-[5.5rem] rounded-lg border p-4" />
      <Separator className="my-4" />

      <div className="grid gap-4 opacity-50 lg:grid-cols-2">
        <div className="border-border bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
        <div className="border-border bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
        <div className="border-border bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
        <div className="border-border bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
      </div>
    </>
  );
}
