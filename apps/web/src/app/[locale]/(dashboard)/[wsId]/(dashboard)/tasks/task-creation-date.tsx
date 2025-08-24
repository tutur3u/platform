'use client';

import { format } from 'date-fns';

export default function TaskCreationDate({
  creationDate,
}: {
  creationDate: string;
}) {
  return (
    <span>
      {creationDate && format(new Date(creationDate), 'MMM d, h:mm a')}
    </span>
  );
}
