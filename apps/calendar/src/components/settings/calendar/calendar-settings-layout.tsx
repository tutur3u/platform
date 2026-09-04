import type { ReactNode } from 'react';

interface CalendarSettingsLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

export function CalendarSettingsLayout({
  children,
  title,
  description,
}: CalendarSettingsLayoutProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="space-y-8">{children}</div>
    </div>
  );
}
