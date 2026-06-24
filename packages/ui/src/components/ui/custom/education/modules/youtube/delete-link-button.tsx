'use client';

import { Trash } from '@tuturuuu/icons';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteLinkButton({
  wsId,
  moduleId,
  link,
  links,
}: {
  wsId: string;
  moduleId: string;
  courseId?: string;
  link: string;
  links: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const updateYoutubeLinks = async (moduleId: string, links: string[]) => {
    setLoading(true);
    try {
      await updateWorkspaceCourseModule(wsId, moduleId, {
        youtube_links: links,
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={async () => {
        await updateYoutubeLinks(
          moduleId,
          links.filter((l) => l !== link)
        );
      }}
      size="icon"
      variant="destructive"
      disabled={loading}
    >
      <Trash className="h-5 w-5" />
    </Button>
  );
}
