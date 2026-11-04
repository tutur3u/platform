'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { BoardMember } from '../../board-members-query';
import { MemberAvatar } from '../plan/plan-parts';
import {
  getDeliveredPercent,
  type SprintSummaryNumbers,
} from './sprint-summary-model';

type Tone = 'green' | 'orange' | 'red' | 'blue' | 'gray' | 'purple';

const TILE_TONES: Record<Tone, string> = {
  green: 'border-dynamic-green/30 bg-dynamic-green/5 [&_b]:text-dynamic-green',
  orange:
    'border-dynamic-orange/30 bg-dynamic-orange/5 [&_b]:text-dynamic-orange',
  red: 'border-dynamic-red/30 bg-dynamic-red/5 [&_b]:text-dynamic-red',
  blue: 'border-dynamic-blue/30 bg-dynamic-blue/5 [&_b]:text-dynamic-blue',
  gray: 'border-dynamic-gray/30 bg-dynamic-gray/5 [&_b]:text-dynamic-gray',
  purple:
    'border-dynamic-purple/30 bg-dynamic-purple/5 [&_b]:text-dynamic-purple',
};

function Tile({
  label,
  sub,
  tone,
  value,
}: {
  label: string;
  sub: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-4',
        TILE_TONES[tone]
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <b className="font-medium text-lg leading-tight">{value}</b>
      <span className="text-muted-foreground text-xs">{sub}</span>
    </div>
  );
}

/** Delivered, tasks done, added mid-sprint and carried in. */
export function SummaryTiles({ numbers }: { numbers: SprintSummaryNumbers }) {
  const t = useTranslations('ws-task-boards.sprints');
  const percent = getDeliveredPercent(numbers);
  const amount = (done: number, total: number) =>
    numbers.usesPoints
      ? t('points_of', { done, total })
      : t('tasks_of', { done, total });

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        label={t('delivered')}
        sub={t('percent_committed', { percent })}
        tone={percent >= 80 ? 'green' : percent >= 50 ? 'orange' : 'red'}
        value={
          numbers.usesPoints
            ? amount(numbers.donePoints, numbers.committedPoints)
            : amount(numbers.doneTasks, numbers.committedTasks)
        }
      />
      <Tile
        label={t('tasks_done')}
        sub={t('tasks_open', { count: numbers.totalTasks - numbers.doneTasks })}
        tone="blue"
        value={`${numbers.doneTasks} / ${numbers.totalTasks}`}
      />
      <Tile
        label={t('added_mid_sprint')}
        sub={t('task_count', { count: numbers.addedTasks })}
        tone={numbers.addedTasks ? 'orange' : 'gray'}
        value={
          numbers.usesPoints
            ? t('added_points', { points: numbers.addedPoints })
            : `+${numbers.addedTasks}`
        }
      />
      <Tile
        label={t('carried_in')}
        sub={t('from_earlier')}
        tone="purple"
        value={String(numbers.carriedIn)}
      />
    </div>
  );
}

/** Done out of assigned, per person. */
export function SummaryPeople({
  members,
  numbers,
}: {
  members: BoardMember[];
  numbers: SprintSummaryNumbers;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const byId = new Map(members.map((member) => [member.id, member]));

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-sm">{t('by_person')}</h3>
        <span className="flex-1" />
        <span className="text-muted-foreground text-xs">
          {t('done_of_assigned')}
        </span>
      </div>
      {numbers.people.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('nobody_assigned')}</p>
      ) : null}
      {numbers.people.map((person) => {
        const member = byId.get(person.userId) ?? {
          id: person.userId,
          display_name: t('former_member'),
        };
        const done = numbers.usesPoints ? person.donePoints : person.doneTasks;
        const total = numbers.usesPoints
          ? person.totalPoints
          : person.totalTasks;
        const percent = total ? Math.round((done / total) * 100) : 0;
        return (
          <div
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1"
            key={person.userId}
          >
            <MemberAvatar className="size-5" member={member} />
            <span className="truncate text-sm">{member.display_name}</span>
            <span className="text-muted-foreground text-xs">
              {numbers.usesPoints
                ? t('points_of', { done, total })
                : t('tasks_of', { done, total })}
            </span>
            <div className="col-span-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-dynamic-green"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
