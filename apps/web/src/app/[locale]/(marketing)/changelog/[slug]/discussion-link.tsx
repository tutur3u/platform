'use client';

import { ArrowRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function ChangelogDiscussionLink() {
  return (
    <Button variant="outline" asChild>
      <a
        href="https://github.com/tutur3u/platform/discussions"
        target="_blank"
        rel="noopener noreferrer"
      >
        Start a Discussion
        <ArrowRight className="ml-2 h-4 w-4" />
      </a>
    </Button>
  );
}
