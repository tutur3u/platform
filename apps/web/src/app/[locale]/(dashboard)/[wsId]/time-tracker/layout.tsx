import TimeTrackerHeader from './components/time-tracker-header';

interface TimeTrackerLayoutProps {
  children: React.ReactNode;
}

export default async function TimeTrackerLayout({
  children,
}: TimeTrackerLayoutProps) {
  return (
    <div className="space-y-4">
      <TimeTrackerHeader />
      {children}
    </div>
  );
}
