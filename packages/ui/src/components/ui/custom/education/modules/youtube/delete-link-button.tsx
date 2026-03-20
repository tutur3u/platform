'use client';

import { Trash } from '@tuturuuu/icons';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteLinkButton({
  wsId,
  moduleId,
  courseId,
  link,
  links,
}: {
  wsId: string;
  moduleId: string;
  courseId: string;
  link: string;
  links: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const updateYoutubeLinks = async (
    moduleId: string,
    courseId: string,
    links: string[]
  ) => {
    setLoading(true);
    try {
      await updateWorkspaceCourseModule(wsId, moduleId, {
        course_id: courseId,
        youtube_links: links,
      });
      router.refresh();
      setLoading(false);
      return null;
    } catch (error) {
      console.error('error', error);
      setLoading(false);
      return null;
    }
  };

  return (
    <Button
      onClick={async () => {
        await updateYoutubeLinks(
          moduleId,
          courseId,
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
