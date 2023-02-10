import { Avatar } from '@mantine/core';

interface RecurringTabProps {
  name: string;
  amount: number;
}

export default function RecurringTab({ name, amount }: RecurringTabProps) {
  return (
    <>
      <div className="flex flex-none w-44 items-center justify-start gap-2 rounded-md bg-zinc-600/70 p-2">
        <Avatar />
        <div className="flex flex-col ">
          <span className="text-base font-semibold">{name}</span>
          <span className="text-sm text-zinc-400">{`${amount} VND`}</span>
        </div>
      </div>
    </>
  );
}
