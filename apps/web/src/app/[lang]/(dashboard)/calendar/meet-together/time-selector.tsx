'use client';

import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  defaultValue?: number;
}

export function TimeSelector({ defaultValue }: Props) {
  const [selectedTime, setSelectedTime] = useState<string | undefined>(
    defaultValue ? String(defaultValue) : undefined
  );

  const handleSelect = (value: string) => {
    setSelectedTime(value);
  };

  const hours = Array.from({ length: 24 }, (_, index) => index + 1);

  return (
    <div className="flex items-end justify-center gap-2">
      <Select value={selectedTime} onValueChange={handleSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Select a time" />
        </SelectTrigger>
        <SelectContent className="h-48">
          {hours.map((hour, index) => (
            <SelectItem key={index} value={hour.toString()}>
              {index < 12
                ? `${String(hour).padStart(2, '0')}:00 AM`
                : `${String(hour - 12).padStart(2, '0')}:00 PM`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
