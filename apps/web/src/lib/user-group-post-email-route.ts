export function getUserGroupPostEmailRoute(params: {
  wsId: string;
  groupId: string;
  postId: string;
}) {
  const { wsId, groupId, postId } = params;
  return `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email`;
}
