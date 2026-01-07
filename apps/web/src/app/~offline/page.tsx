import { OfflinePage } from '@tuturuuu/offline/components';

export default function Offline() {
  return (
    <OfflinePage
      title="You're Offline"
      message="Please check your internet connection and try again."
      className="bg-background text-foreground"
    />
  );
}
