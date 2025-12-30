import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useLocale } from 'next-intl';

interface Props {
  value: number | undefined;
  onValueChange: (value: number) => void;
  disabledTime?: number | undefined;
  isStartTime?: boolean; // Add prop to distinguish between start and end time selectors
}

export function TimeSelector({
  value,
  onValueChange,
  disabledTime,
  isStartTime = false,
}: Props) {
  const locale = useLocale();

  const hours = Array.from({ length: 24 }, (_, index) => index + 1);

  // Function to determine if a time option should be disabled
  const isTimeDisabled = (hour: number) => {
    if (!disabledTime) return false;

    if (isStartTime) {
      // For start time: disable times that are greater than or equal to the end time
      return hour >= disabledTime;
    } else {
      // For end time: disable times that are less than or equal to the start time
      return hour <= disabledTime;
    }
  };

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange(parseInt(value, 10))}
    >
      <SelectTrigger className="bg-background/50 transition hover:bg-background/80">
        <SelectValue placeholder="Select a time" />
      </SelectTrigger>
      <SelectContent className="h-48">
        {hours.map((hour) => (
          <SelectItem
            key={hour}
            value={hour.toString()}
            disabled={isTimeDisabled(hour)}
          >
            {hour === 12
              ? '12:00 PM'
              : hour === 24
                ? '12:00 AM'
                : hour < 12
                  ? `${String(hour).padStart(2, '0')}:00 ${locale === 'vi' ? 'SA' : 'AM'}`
                  : `${String(hour - 12).padStart(2, '0')}:00 ${locale === 'vi' ? 'CH' : 'PM'}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
