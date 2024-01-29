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

export default function TimezoneSelector() {
  const [selectedTimezone, setSelectedTimezone] = useState<string>();

  const handleSelect = (value: string) => {
    const selected = timezones.find((timezone) => timezone.value === value);
    setSelectedTimezone(selected?.value);
  };

  return (
    <div className="flex items-end justify-center gap-2">
      <Select value={selectedTimezone} onValueChange={handleSelect}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a timezone" />
        </SelectTrigger>
        <SelectContent>
          {timezones.map((timezone, index) => (
            <SelectItem key={index} value={timezone.value}>
              {timezone.text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
