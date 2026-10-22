/** Administrator profile syntax only; reservation and availability are server-owned. */
export function isValidAdminProfileHandle({
  username,
  currentUsername,
}: {
  username: string | null;
  currentUsername: string | null;
}): boolean {
  return (
    username === null ||
    username === currentUsername ||
    (/^[a-z0-9]/.test(username) && !/[^a-z0-9_]/.test(username))
  );
}
