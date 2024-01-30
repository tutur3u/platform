'use client';

import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import timezones from '../../../../../data/timezones.json';
import useTranslation from 'next-translate/useTranslation';

export default function TimezoneSelector() {
  const { t } = useTranslation('meet-together');

  const [selectedTimezone, setSelectedTimezone] = useState<string>();

  const handleSelect = (value: string) => {
    const selected = timezones.find((timezone) => timezone.value === value);
    setSelectedTimezone(selected?.value);
  };

  return (
    <Select value={selectedTimezone} onValueChange={handleSelect}>
      <SelectTrigger className="md:w-64">
        <SelectValue placeholder={t('select-time-zone')} />
      </SelectTrigger>
      <SelectContent>
        {timezones.map((timezone, index) => (
          <SelectItem key={index} value={timezone.value}>
            {timezone.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
