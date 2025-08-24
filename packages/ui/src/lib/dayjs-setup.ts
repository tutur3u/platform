import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import minMax from 'dayjs/plugin/minMax';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with all commonly used plugins once
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.extend(minMax);

// Set default timezone handling
dayjs.tz.setDefault();

// Export dayjs instance for use in other modules
export { dayjs };

// Re-export plugins if needed elsewhere
export { timezone, utc, isSameOrBefore, isSameOrAfter, isBetween, minMax };
