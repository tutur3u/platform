import { createFileRoute } from '@tanstack/react-router';
import { OfflinePage } from '@tuturuuu/offline/components';

export const Route = createFileRoute('/~offline')({
  component: Offline,
});

function Offline() {
  return (
    <OfflinePage
      title="You're Offline"
      message="Please check your internet connection and try again."
      className="bg-background text-foreground"
    />
  );
}
