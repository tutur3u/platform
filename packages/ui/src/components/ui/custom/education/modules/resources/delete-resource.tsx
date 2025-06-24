'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Trash } from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function DeleteResourceButton({ path }: { path: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, []);

  const deleteResource = async (path: string) => {
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.storage.from('workspaces').remove([path]);

    if (!error) {
      router.refresh();
    } else {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={async () => {
        await deleteResource(path);
      }}
      size="icon"
      variant="destructive"
      disabled={loading}
    >
      <Trash className="h-5 w-5" />
    </Button>
  );
}
