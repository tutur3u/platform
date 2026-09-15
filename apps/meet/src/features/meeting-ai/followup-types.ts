export type MeetingFollowup = {
  key: string;
  kind: 'task' | 'event';
  title: string;
  evidence: string;
  owner: string | null;
  timeText: string | null;
  startLocal: string | null;
  endLocal: string | null;
  timezone: string | null;
};
