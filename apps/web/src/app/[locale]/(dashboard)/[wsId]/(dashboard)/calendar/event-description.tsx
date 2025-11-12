'use client';

import { containsHtml, sanitizeHtml } from '@tuturuuu/utils/html-sanitizer';

interface EventDescriptionProps {
  description: string;
  className?: string;
}

export default function EventDescription({
  description,
  className = '',
}: EventDescriptionProps) {
  if (!description) return null;

  return (
    <div
      className={`event-description ${className}`}
      dangerouslySetInnerHTML={{
        __html: containsHtml(description)
          ? sanitizeHtml(description)
          : description,
      }}
    />
  );
}
