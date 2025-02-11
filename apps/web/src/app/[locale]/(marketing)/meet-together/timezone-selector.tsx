import timezones from '../../../../data/timezones.json';
import { Timezone } from '@tutur3u/types/primitives/Timezone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/select';
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
      <SelectTrigger className="w-full md:min-w-72 lg:min-w-96">
        <SelectValue placeholder={t('select-time-zone')} />
      </SelectTrigger>
      <SelectContent>
        {timezones.map((timezone: Timezone, index) => (
          <SelectItem key={index} value={timezone.value}>
            {timezone.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
