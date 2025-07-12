'use client';

import { timetzToTime } from '@/utils/date-helper';

export default function UserTime({ time }: { time: string }) {
  return <span>{timetzToTime(time)}</span>;
}
