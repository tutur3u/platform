import CalendarCell from './CalendarCell';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';

// Define TimeBlock interface locally to avoid import issues
// interface TimeBlock {
//   startTime: string;
//   endTime: string;
// }

interface CalendarColumnProps {
  date: string;
}

const CalendarColumn = ({ date }: CalendarColumnProps) => {
  const hours = Array.from(Array(24).keys());
  // const { settings } = useCalendar();

  // Get day of week from date
  // const dayDate = new Date(date);
  // const dayOfWeek = dayDate.getDay(); // 0 = Sunday, 6 = Saturday

  // // Map day of week to settings key
  // const getDayKey = (day: number): string => {
  //   switch (day) {
  //     case 0:
  //       return 'sunday';
  //     case 1:
  //       return 'monday';
  //     case 2:
  //       return 'tuesday';
  //     case 3:
  //       return 'wednesday';
  //     case 4:
  //       return 'thursday';
  //     case 5:
  //       return 'friday';
  //     case 6:
  //       return 'saturday';
  //     default:
  //       return 'monday';
  //   }
  // };

  // const dayKey = getDayKey(dayOfWeek);

  // Get time blocks for this day
  // const personalHours =
  //   settings?.personalHours?.[dayKey as keyof typeof settings.personalHours];
  // const workHours =
  //   settings?.workHours?.[dayKey as keyof typeof settings.workHours];
  // const meetingHours =
  //   settings?.meetingHours?.[dayKey as keyof typeof settings.meetingHours];

  // Convert time string (HH:MM) to minutes since midnight
  // const timeToMinutes = (time: string): number => {
  //   const parts = time.split(':').map(Number);
  //   const hours = parts[0] || 0;
  //   const minutes = parts[1] || 0;
  //   return hours * 60 + minutes;
  // };

  // Calculate position and height for time blocks
  // const getTimeBlockStyle = (startTime: string, endTime: string) => {
  //   const startMinutes = timeToMinutes(startTime);
  //   const endMinutes = timeToMinutes(endTime);

  //   // Handle overnight blocks
  //   let durationMinutes = endMinutes - startMinutes;
  //   if (durationMinutes < 0) {
  //     durationMinutes = 24 * 60 - startMinutes + endMinutes;
  //   }

  //   const startHour = startMinutes / 60;
  //   const height = (durationMinutes / 60) * HOUR_HEIGHT;

  //   return {
  //     top: `${startHour * HOUR_HEIGHT}px`,
  //     height: `${height}px`,
  //   };
  // };

  return (
    <div
      className="border-border/30 relative grid border border-r"
      style={{
        gridTemplateRows: `repeat(24, ${HOUR_HEIGHT}px)`,
        minWidth: '120px',
        height: `${DAY_HEIGHT}px`, // 24 hours * 80px = 1920px
      }}
    >
      {/* Personal hours blocks */}
      {/* {personalHours?.enabled &&
        personalHours?.timeBlocks?.map((block: TimeBlock, index: number) => (
          <div
            key={`personal-${index}`}
            className="pointer-events-none absolute right-0 left-0 z-0 bg-blue-100/30 dark:bg-blue-900/10"
            style={getTimeBlockStyle(block.startTime, block.endTime)}
          />
        ))} */}

      {/* Work hours blocks */}
      {/* {workHours?.enabled &&
        workHours?.timeBlocks?.map((block: TimeBlock, index: number) => (
          <div
            key={`work-${index}`}
            className="pointer-events-none absolute right-0 left-0 z-0 bg-green-100/30 dark:bg-green-900/10"
            style={getTimeBlockStyle(block.startTime, block.endTime)}
          />
        ))} */}

      {/* Meeting hours blocks */}
      {/* {meetingHours?.enabled &&
        meetingHours?.timeBlocks?.map((block: TimeBlock, index: number) => (
          <div
            key={`meeting-${index}`}
            className="pointer-events-none absolute right-0 left-0 z-0 bg-orange-100/30 dark:bg-orange-900/10"
            style={getTimeBlockStyle(block.startTime, block.endTime)}
          />
        ))} */}

      {hours.map((hour) => (
        <CalendarCell key={`${date}-${hour}`} date={date} hour={hour} />
      ))}
    </div>
  );
};

export default CalendarColumn;
