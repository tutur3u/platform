'use client';

import { format } from 'date-fns';

export default function TaskCreationDate({
  creationDate,
}: {
  creationDate: string;
}) {
  return (
    <span className="font-semibold text-dynamic-pink">
      {creationDate && format(new Date(creationDate), 'MMM d, h:mm a')}
    </span>
  );
}
