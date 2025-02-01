import { Timezone } from '@/types/primitives/Timezone';
import { Separator } from '@repo/ui/components/ui/separator';
import moment from 'moment';

interface Props {
  data: Timezone;
}

const TimezoneCard = ({ data }: Props) => {
  return (
    <div className="group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800">
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            value: {data.value}
          </div>
          <div className="line-clamp-1 font-semibold tracking-wide">
            abbr: {data.abbr}
          </div>
          <div className="line-clamp-1 font-semibold tracking-wide">
            offset: {data.offset}
          </div>
          <div className="line-clamp-1 font-semibold tracking-wide">
            isdst: {data.isdst}
          </div>
          <div className="line-clamp-1 font-semibold tracking-wide">
            text: {data.text}
          </div>
          <div className="line-clamp-1 font-semibold tracking-wide">
            utc: {data.utc.join(', ')}
          </div>
        </div>
      </div>

      <Separator className="w-full border-border dark:border-zinc-700" />

      <div className="m-2 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-green-500/20 bg-green-500/10 p-2 font-semibold text-green-600 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300">
          Created at {moment(data?.created_at).format('HH:mm, DD/MM/YYYY')}
        </div>
      </div>
    </div>
  );
};

export default TimezoneCard;
