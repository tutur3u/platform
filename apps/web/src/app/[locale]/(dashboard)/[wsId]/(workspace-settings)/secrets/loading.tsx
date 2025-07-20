import { CustomDataTable } from '@/components/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';

export default function Loading() {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 text-transparent md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">secrets</h1>
          <p className="">description</p>
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable namespace="secret-data-table" />
    </>
  );
}
