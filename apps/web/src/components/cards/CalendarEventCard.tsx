import { useWorkspaces } from '@/hooks/useWorkspaces';
import { CalendarEvent } from '@/types/primitives/calendar-event';
import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { Divider } from '@mantine/core';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

interface Props {
  event: CalendarEvent;
  showDescription?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

const CalendarEventCard = ({
  event,
  showDescription = false,
  orientation = 'vertical',
}: Props) => {
  const { ws } = useWorkspaces();
  const { t } = useTranslation();

  if (!ws) return null;

  const eventColor = event?.color?.toLowerCase() || 'blue';

  const generateColor = () => {
    const colors: {
      [key: string]: string;
    } = {
      red: 'bg-[#fcdada] dark:bg-[#302729] border-red-500/80 text-red-600 dark:border-red-300/80 dark:text-red-200',
      blue: 'bg-[#d8e6fd] dark:bg-[#252a32] border-blue-500/80 text-blue-600 dark:border-blue-300/80 dark:text-blue-200',
      green:
        'bg-[#d3f3df] dark:bg-[#242e2a] border-green-500/80 text-green-600 dark:border-green-300/80 dark:text-green-200',
      yellow:
        'bg-[#fbf0ce] dark:bg-[#302d1f] border-yellow-500/80 text-yellow-600 dark:border-yellow-300/80 dark:text-yellow-200',
      orange:
        'bg-[#fee3d0] dark:bg-[#302924] border-orange-500/80 text-orange-600 dark:border-orange-300/80 dark:text-orange-200',
      purple:
        'bg-[#eeddfd] dark:bg-[#2c2832] border-purple-500/80 text-purple-600 dark:border-purple-300/80 dark:text-purple-200',
      pink: 'bg-[#fbdaeb] dark:bg-[#2f272e] border-pink-500/80 text-pink-600 dark:border-pink-300/80 dark:text-pink-200',
      indigo:
        'bg-[#e0e0fc] dark:bg-[#272832] border-indigo-500/80 text-indigo-600 dark:border-indigo-300/80 dark:text-indigo-200',
      cyan: 'bg-[#cdf0f6] dark:bg-[#212e31] border-cyan-500/80 text-cyan-600 dark:border-cyan-300/80 dark:text-cyan-200',
      gray: 'bg-[#e1e3e6] dark:bg-[#2b2c2e] border-gray-500/80 text-gray-600 dark:border-gray-300/80 dark:text-gray-200',
    };

    return colors[eventColor];
  };

  const isSameDay = moment(event.start_at).isSame(event.end_at, 'day');
  const untitledLabel = t('common:untitled');

  return (
    <Link
      href={`/${ws.id}/calendar/events/${event.id}`}
      className={`group flex w-full items-center justify-center rounded-lg border text-center transition ${generateColor()} ${
        orientation === 'horizontal' ? 'flex-row' : 'flex-col'
      }`}
    >
      <div
        className={`flex w-full flex-col justify-center ${
          orientation === 'horizontal'
            ? 'p-4 text-start'
            : 'items-center p-2 text-center'
        }`}
      >
        <div
          className={`line-clamp-1 font-semibold tracking-wide ${
            !event?.title && 'opacity-70 dark:opacity-50'
          }`}
        >
          {event?.title || untitledLabel}{' '}
        </div>
        {showDescription && (
          <div className="text-foreground/80 line-clamp-1 font-semibold dark:text-zinc-400/70">
            {event.description}
          </div>
        )}
      </div>

      <>
        {orientation === 'vertical' && (
          <Divider className={`w-full opacity-50 ${generateColor()}`} />
        )}

        <div
          className={`flex w-full gap-2 opacity-80 ${
            orientation === 'horizontal'
              ? 'mx-4 my-2 max-w-md items-center justify-end'
              : 'items-center justify-between p-2'
          }`}
        >
          {isSameDay && (
            <>
              <div className={`line-clamp-1 font-semibold ${generateColor()}`}>
                {moment(event.start_at).format('DD/MM/YYYY')}
              </div>
              {orientation === 'horizontal' && ' | '}
            </>
          )}

          <div
            className={`flex gap-2 ${
              orientation === 'horizontal'
                ? 'max-w-md items-center justify-end'
                : 'items-center justify-between'
            }`}
          >
            <div className={`line-clamp-1 font-semibold ${generateColor()}`}>
              {moment(event.start_at).format(
                isSameDay ? 'HH:mm' : 'DD/MM/YYYY, HH:mm'
              )}
            </div>

            <ArrowRightIcon
              className={`h-4 w-4 flex-none ${generateColor()}`}
            />

            <div className={`line-clamp-1 font-semibold ${generateColor()}`}>
              {moment(event.end_at).format(
                isSameDay ? 'HH:mm' : 'DD/MM/YYYY, HH:mm'
              )}
            </div>
          </div>
        </div>
      </>
    </Link>
  );
};

export default CalendarEventCard;
