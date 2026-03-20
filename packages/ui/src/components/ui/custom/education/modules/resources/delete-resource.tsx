'use client';

import { Trash } from '@tuturuuu/icons';
import { deleteWorkspaceStorageObject } from '@tuturuuu/internal-api/education';
import { Button } from '@tuturuuu/ui/button';
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
    const wsId = path.split('/')[0];

    if (!wsId) {
      setLoading(false);
      return;
    }

    try {
      await deleteWorkspaceStorageObject(wsId, path);
      router.refresh();
    } catch {
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
