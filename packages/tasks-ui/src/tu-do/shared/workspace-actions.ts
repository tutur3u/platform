export function createAuthorizedWorkspaceReader<
  User extends { id: string },
  Workspaces,
>({
  getActor,
  readWorkspaces,
}: {
  getActor: () => Promise<User | null | undefined>;
  readWorkspaces: () => Promise<Workspaces>;
}) {
  return async function fetchAuthorizedWorkspaces() {
    const user = await getActor();
    if (!user?.id) throw new Error('Unauthorized');
    return readWorkspaces();
  };
}
