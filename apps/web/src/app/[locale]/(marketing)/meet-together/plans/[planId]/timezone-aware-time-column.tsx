import { useLocale } from 'next-intl';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(timezone);
dayjs.extend(utc);

interface TimezoneAwareTimeColumnProps {
  id: string;
  start: string; // timetz format like "09:00:00+08"
  end: string;   // timetz format like "17:00:00+08"
  date: string;  // date like "2024-07-23"
  className?: string;
}

export default function TimezoneAwareTimeColumn({
  id,
  start,
  end,
  date,
  className,
}: TimezoneAwareTimeColumnProps) {
  const locale = useLocale();
  const userTimezone = dayjs.tz.guess();

  // Use current date if no date provided
  const referenceDate = date || dayjs().format('YYYY-MM-DD');

  // Convert plan times to user's local timezone
  const convertTimetzToLocalHour = (timetz: string, referenceDate: string): number => {
    try {
      // Extract time and timezone offset
      const time = timetz.substring(0, timetz.lastIndexOf('+') !== -1 ? timetz.lastIndexOf('+') : timetz.lastIndexOf('-'));
      const offset = timetz.substring(timetz.lastIndexOf('+') !== -1 ? timetz.lastIndexOf('+') : timetz.lastIndexOf('-'));
      
      // Convert offset to timezone name
      const timezoneName = getTimezoneFromOffset(offset);
      
      // Create datetime in plan's timezone and convert to user's timezone
      const planDateTime = dayjs.tz(`${referenceDate} ${time}`, timezoneName);
      const userDateTime = planDateTime.tz(userTimezone);
      

      
      return userDateTime.hour();
    } catch (error) {
      console.error('Error converting timetz to local hour:', error);
      // Fallback: extract hour from original time
      return parseInt(timetz.substring(0, 2));
    }
  };

  // Helper function to convert offset to timezone name
  const getTimezoneFromOffset = (offset: string): string => {
    // Remove the sign and convert to number for lookup
    const offsetNum = parseInt(offset, 10);
    const offsetKey = offsetNum.toString();
    
    // Simple mapping for common offsets
    const offsetMap: Record<string, string> = {
      '-12': 'Etc/GMT+12',
      '-11': 'Etc/GMT+11',
      '-10': 'Pacific/Honolulu',
      '-9': 'America/Anchorage',
      '-8': 'America/Los_Angeles',
      '-7': 'America/Denver',
      '-6': 'America/Chicago',
      '-5': 'America/New_York',
      '-4': 'America/Toronto',
      '-3': 'America/Sao_Paulo',
      '-2': 'Atlantic/South_Georgia',
      '-1': 'Atlantic/Azores',
      '0': 'UTC',
      '1': 'Europe/London',
      '2': 'Europe/Berlin',
      '3': 'Europe/Moscow',
      '4': 'Asia/Dubai',
      '5': 'Asia/Karachi',
      '5.5': 'Asia/Kolkata',
      '6': 'Asia/Dhaka',
      '7': 'Asia/Bangkok',
      '8': 'Asia/Shanghai',
      '9': 'Asia/Tokyo',
      '10': 'Australia/Sydney',
      '11': 'Pacific/Guadalcanal',
      '12': 'Pacific/Auckland',
    };
    return offsetMap[offset] || offsetMap[offsetKey] || 'UTC';
  };

  const localStartHour = convertTimetzToLocalHour(start, referenceDate);
  const localEndHour = convertTimetzToLocalHour(end, referenceDate);



  return (
    <div className={className}>
      <div className="p-1 text-transparent">
        <div className="text-xs">0</div>
        <div className="text-lg">0</div>
      </div>

      <div className="border border-b-0 border-transparent">
        {(() => {
          // Handle time ranges that cross midnight
          let timeSlots = [];

          if (localEndHour >= localStartHour) {
            // Normal case: same day
            timeSlots = Array.from(
              Array(Math.floor(localEndHour + 1 - localStartHour)).keys()
            ).map((i) => (i + localStartHour) * 4);
          } else {
            // Crosses midnight: split into two parts
            // Part 1: from start to 23 (end of day)
            const part1 = Array.from(Array(24 - localStartHour))
              .keys()
              .map((i) => (i + localStartHour) * 4);
            // Part 2: from 0 to end (beginning of next day)
            const part2 = Array.from(Array(localEndHour + 1))
              .keys()
              .map((i) => i * 4);
            timeSlots = [...part1, ...part2];
          }

          return (
            timeSlots
              // duplicate each item 4 times with unique identifiers
              .flatMap((hr) => [
                { hr, slot: 0, key: `${id}-time-${hr}-slot-0` },
                { hr, slot: 1, key: `${id}-time-${hr}-slot-1` },
                { hr, slot: 2, key: `${id}-time-${hr}-slot-2` },
                { hr, slot: 3, key: `${id}-time-${hr}-slot-3` },
              ])
              .map(({ hr, key, slot }) => (
                <div
                  key={key}
                  className={`relative h-3 w-14 ${
                    hr === 0
                      ? ''
                      : (hr + 1) % 4 === 0 || (hr + 1) % 2 === 0
                        ? 'border-b border-transparent'
                        : ''
                  }`}
                >
                  {slot === 0 && (
                    <div className="absolute -top-2 right-0 text-xs">
                      <div className="flex-none text-xs">
                        {hr / 4 === 12
                          ? '12:00 PM'
                          : hr / 4 === 24
                            ? '12:00 AM'
                            : hr / 4 < 12
                              ? `${hr / 4}:00 ${locale === 'vi' ? 'SA' : 'AM'}`
                              : `${hr / 4 - 12}:00 ${locale === 'vi' ? 'CH' : 'PM'}`}
                      </div>
                    </div>
                  )}
                </div>
              ))
          );
        })()}
      </div>
    </div>
  );
} 