import '@mantine/charts/styles.layer.css';
import '@mantine/core/styles.layer.css';
import { MantineThemeProvider } from '@/components/mantine-theme-provider';
import TimeTrackerHeader from './components/time-tracker-header';

interface TimeTrackerLayoutProps {
  children: React.ReactNode;
}

export default async function TimeTrackerLayout({
  children,
}: TimeTrackerLayoutProps) {
  return (
    <MantineThemeProvider>
      <div className="space-y-4">
        <TimeTrackerHeader />
        {children}
      </div>
    </MantineThemeProvider>
  );
}
