'use client';

import { createClient } from '@tutur3u/supabase/next/client';
import { Button } from '@tutur3u/ui/components/ui/button';
import { Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteLinkButton({
  moduleId,
  courseId,
  link,
  links,
}: {
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
    const supabase = createClient();

    const { data, error } = await supabase
      .from('workspace_course_modules')
      .update({
        youtube_links: links,
      })
      .eq('id', moduleId)
      .eq('course_id', courseId);

    if (error) {
      console.error('error', error);
      setLoading(false);
    } else {
      router.refresh();
    }

    return data;
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
