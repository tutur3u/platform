import { createFileRoute } from '@tanstack/react-router';
import { UserGroupLoading } from '../../../../../components/loading/workspace-route-loading';

export const Route = createFileRoute('/$locale/$wsId/users/groups/$groupId')({
  component: UserGroupLoading,
});
