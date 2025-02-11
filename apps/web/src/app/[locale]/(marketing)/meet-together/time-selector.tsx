import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/select';
import { useLocale } from 'next-intl';

interface Props {
  value: number | undefined;
  onValueChange: (value: number) => void;
  disabledTime?: number | undefined;
}

export function TimeSelector({ value, onValueChange, disabledTime }: Props) {
  const locale = useLocale();

  const hours = Array.from({ length: 23 }, (_, index) => index + 1);

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange(parseInt(value))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a time" />
      </SelectTrigger>
      <SelectContent className="h-48">
        {hours.map((hour) => (
          <SelectItem
            key={hour}
            value={hour.toString()}
            disabled={hour === disabledTime}
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
