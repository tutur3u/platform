import { FolderX } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';

export default function RepositoryNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-md space-y-5 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border bg-muted">
          <FolderX className="h-6 w-6 text-muted-foreground" />
        </span>
        <div className="space-y-2">
          <h1 className="font-semibold text-2xl">Repository not found</h1>
          <p className="text-muted-foreground text-sm leading-6">
            This repository is not registered, is private, or the requested
            resource does not exist.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/tutur3u/platform">Open tutur3u/platform</Link>
        </Button>
      </div>
    </main>
  );
}
