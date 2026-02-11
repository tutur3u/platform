import { Image } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export default function DownloadAsPNG({ onClick }: { onClick?: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={!onClick}
      className="w-full md:w-auto"
    >
      <Image className="mr-2 h-4 w-4" />
      Download
    </Button>
  );
}
