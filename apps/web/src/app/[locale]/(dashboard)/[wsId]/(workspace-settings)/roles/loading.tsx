import { Separator } from '@tuturuuu/ui/separator';
import { CustomDataTable } from '@/components/custom-data-table';

export default function Loading() {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 text-transparent md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">roles</h1>
          <p className="">description</p>
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable namespace="workspace-role-data-table" />
    </>
  );
}
