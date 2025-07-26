'use client';

import { timetzToTime } from '../../../../utils/date-helper';

interface UserTimeProps {
  time: string;
  date?: string; // Optional date string in YYYY-MM-DD format
}

export default function UserTime({ time, date }: UserTimeProps) {
  return <span>{timetzToTime(time, date)}</span>;
}
