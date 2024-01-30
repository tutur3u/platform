'use client';

import { Calendar } from '@/components/ui/calendar';
import { useState } from 'react';

export default function DateSelector() {
  const [dates, setDates] = useState<Date[] | undefined>([]);

  return (
    <Calendar
      mode="multiple"
      selected={dates}
      onSelect={setDates}
      className="w-fit rounded-md border"
    />
  );
}
