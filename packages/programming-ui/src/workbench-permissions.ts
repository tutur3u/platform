/** UI controls mirror the authorized room role; the API remains authoritative. */
export function workbenchPermissions(
  role: string | undefined,
  status: string,
  hasExecutionAdapter: boolean
) {
  return {
    owner: role === 'owner',
    canExecute: role === 'owner' || (hasExecutionAdapter && role === 'editor'),
    editable: status === 'open' && (role === 'owner' || role === 'editor'),
  };
}
