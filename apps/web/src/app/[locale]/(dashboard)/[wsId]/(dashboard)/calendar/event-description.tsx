'use client';

import { sanitizeHtml } from '@tuturuuu/utils/html-sanitizer';

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
      // eslint-disable-next-line react/no-danger -- Every description passes through the shared sanitizeHtml allowlist.
      dangerouslySetInnerHTML={{
        __html: sanitizeHtml(description),
      }}
    />
  );
}
