import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import timezones from '@tuturuuu/utils/timezones';
import { useTranslations } from 'next-intl';

interface Props {
  value: Timezone | undefined;
  onValueChange: (value: Timezone) => void;
}

export default function TimezoneSelector({ value, onValueChange }: Props) {
  const t = useTranslations('meet-together');

  const handleValueChange = (value: string) => {
    const timezone = timezones.find((timezone) => timezone.value === value);
    if (timezone) onValueChange(timezone);
  };

  return (
    <Select value={value?.value} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full @lg:min-w-96 @md:min-w-72 bg-background/50 transition hover:bg-background/80">
        <SelectValue placeholder={t('select-time-zone')} />
      </SelectTrigger>
      <SelectContent>
        {timezones.map((timezone: Timezone, idx) => (
          <SelectItem key={`timezone-${idx + 1}`} value={timezone.value}>
            {timezone.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
