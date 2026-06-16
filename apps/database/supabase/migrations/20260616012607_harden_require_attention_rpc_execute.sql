revoke all on function public.get_workspace_users_require_attention(uuid, uuid[], uuid)
from public, anon, authenticated;

grant execute on function public.get_workspace_users_require_attention(uuid, uuid[], uuid)
to service_role;

comment on function public.get_workspace_users_require_attention(uuid, uuid[], uuid) is
'Returns distinct workspace user IDs that have at least one require-attention feedback. Execute is restricted to service_role so server-owned routes can enforce workspace permissions before calling it.';
