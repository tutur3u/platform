import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
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
    <SettingsSection title={title} description={description}>
      {children}
    </SettingsSection>
  );
}
