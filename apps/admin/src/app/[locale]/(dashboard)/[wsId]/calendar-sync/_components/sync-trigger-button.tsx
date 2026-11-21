import { ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';

interface Props {
  calendarAppUrl: string;
  wsId: string;
}

export default function SyncTriggerButton({ calendarAppUrl, wsId }: Props) {
  const calendarWorkspaceUrl = new URL(
    `/${encodeURIComponent(wsId)}`,
    calendarAppUrl
  ).toString();

  return (
    <Button asChild className="gap-2" size="sm">
      <Link href={calendarWorkspaceUrl}>
        <ExternalLink className="h-4 w-4" />
        Open Calendar to sync
      </Link>
    </Button>
  );
}
