import timezones from '../../../../../data/timezones.json';
import { Timezone } from '@/types/primitives/Timezone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  value: Timezone | undefined;
  onValueChange: (value: Timezone) => void;
}

export default function TimezoneSelector({ value, onValueChange }: Props) {
  const { t } = useTranslation('meet-together');

  const handleValueChange = (value: string) => {
    const timezone = timezones.find((timezone) => timezone.value === value);
    if (timezone) onValueChange(timezone);
  };

  return (
    <Select value={value?.value} onValueChange={handleValueChange}>
      <SelectTrigger className="md:w-72 lg:w-96">
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
