import { AlertCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';

export default function TaskNotFound() {
  return (
    <div className="flex min-h-100 flex-col items-center justify-center gap-4 p-8">
      <AlertCircle className="h-16 w-16 text-muted-foreground" />
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Task Not Found</h1>
        <p className="mt-2 text-muted-foreground">
          The task you're looking for doesn't exist or has been deleted.
        </p>
      </div>
      <Button asChild>
        <Link href="../boards">Back to Boards</Link>
      </Button>
    </div>
  );
}
