import type { CronMonitoringTranslations } from './status';

function parseCronNumber(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return parsed >= min && parsed <= max ? parsed : null;
}

function parseStep(value: string, min: number, max: number) {
  if (!value.startsWith('*/')) {
    return null;
  }

  return parseCronNumber(value.slice(2), min, max);
}

function formatDailyTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function describeSchedule(
  schedule: string,
  t: CronMonitoringTranslations
) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    return t('cron.schedule.raw', { schedule });
  }

  const minute = parts[0] ?? '';
  const hour = parts[1] ?? '';
  const dayOfMonth = parts[2] ?? '';
  const month = parts[3] ?? '';
  const dayOfWeek = parts[4] ?? '';
  const everyDay = dayOfMonth === '*' && month === '*' && dayOfWeek === '*';

  if (hour === '*' && everyDay) {
    if (minute === '*') {
      return t('cron.schedule.every_minutes', { count: 1 });
    }

    const minutes = parseStep(minute, 1, 59);
    if (minutes != null) {
      return t('cron.schedule.every_minutes', { count: minutes });
    }
  }

  if (minute === '0' && everyDay) {
    const hours = parseStep(hour, 1, 23);
    if (hours != null) {
      return t('cron.schedule.every_hours', { count: hours });
    }
  }

  if (everyDay) {
    const parsedMinute = parseCronNumber(minute, 0, 59);
    const parsedHour = parseCronNumber(hour, 0, 23);

    if (parsedHour != null && parsedMinute != null) {
      return t('cron.schedule.daily_at', {
        time: formatDailyTime(parsedHour, parsedMinute),
      });
    }
  }

  return t('cron.schedule.raw', { schedule });
}
