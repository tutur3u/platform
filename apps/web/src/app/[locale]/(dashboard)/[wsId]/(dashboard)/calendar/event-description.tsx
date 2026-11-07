'use client';

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
    <div className={`event-description whitespace-pre-wrap ${className}`}>
      {description}
    </div>
  );
}
