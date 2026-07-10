import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/vi';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.extend(isoWeek);
