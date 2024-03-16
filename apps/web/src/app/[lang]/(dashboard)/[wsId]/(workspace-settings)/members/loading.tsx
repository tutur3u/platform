import { Separator } from '@/components/ui/separator';
import MemberList from './_components/member-list';

export default function Loading() {
  return (
    <>
      <div className="border-border bg-foreground/5 h-[5.5rem] rounded-lg border" />
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col">
        <div className="grid items-end gap-4 lg:grid-cols-2">
          <MemberList
            members={Array.from({ length: 10 }).map((_, i) => ({
              id: i.toString(),
              display_name: 'Unknown',
              role: 'MEMBER',
              pending: true,
            }))}
            loading
          />
        </div>
      </div>
    </>
  );
}
