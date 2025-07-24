import { Button } from '@tuturuuu/ui/button';
import { Image } from '@tuturuuu/ui/icons';

export default function DownloadAsPNG({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={!onClick}>
      <Image className="mr-2 h-4 w-4" />
      Download
    </Button>
  );
}
