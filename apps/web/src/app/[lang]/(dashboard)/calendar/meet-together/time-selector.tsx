import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  value: number | undefined;
  onValueChange: (value: number) => void;
}

export function TimeSelector({ value, onValueChange }: Props) {
  const { lang } = useTranslation();

  const hours = Array.from({ length: 24 }, (_, index) => index + 1);

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange(parseInt(value))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a time" />
      </SelectTrigger>
      <SelectContent className="h-48">
        {hours.map((hour, index) => (
          <SelectItem key={index} value={hour.toString()}>
            {index < 12
              ? `${String(hour).padStart(2, '0')}:00 ${lang === 'vi' ? 'SA' : 'AM'}`
              : `${String(hour - 12).padStart(2, '0')}:00 ${lang === 'vi' ? 'CH' : 'PM'}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
