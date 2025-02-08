'use client';

import { WorkspaceUser } from '@repo/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import { CheckCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CheckAll({
  wsId,
  groupId,
  postId,
  users,
  completed,
}: {
  wsId: string;
  groupId: string;
  postId: string;
  users: WorkspaceUser[];
  completed: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const endpoint = `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}`;

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        users.map((user) => ({
          post_id: postId,
          user_id: user.id,
          is_completed: true,
        }))
      ),
    });

    if (response.ok) {
      router.refresh();
    }

    setLoading(false);
  };

  return (
    <Button onClick={handleSubmit} disabled={loading || completed}>
      <CheckCheck className="mr-1" />
      {completed || t('ws_post_details.check_all')}
    </Button>
  );
}
