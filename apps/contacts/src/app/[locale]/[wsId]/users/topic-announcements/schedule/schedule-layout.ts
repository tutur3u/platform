/** Column template shared by the session list header and its rows. */
export const SCHEDULE_GRID_COLUMNS =
  'grid grid-cols-[5.5rem_4.5rem_minmax(9rem,1.2fr)_minmax(7rem,1fr)_minmax(9rem,1.2fr)_5rem_6rem_8.5rem] items-center gap-2';

export const scheduleRowDomId = (key: string) =>
  `schedule-row-${key.replace(/[^a-zA-Z0-9-]/gu, '-')}`;
