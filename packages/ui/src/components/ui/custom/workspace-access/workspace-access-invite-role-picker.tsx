'use client';

import { ShieldUser } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useTranslations } from 'next-intl';

export function WorkspaceAccessInviteRolePicker({
  noRoleLabel,
  onChange,
  roleIds,
  roles,
}: {
  noRoleLabel: string;
  onChange: (roleIds: string[]) => void;
  roleIds: string[];
  roles: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations();
  const selected = new Set(roleIds);

  const toggleRole = (roleId: string) => {
    onChange(
      selected.has(roleId)
        ? roleIds.filter((id) => id !== roleId)
        : [...roleIds, roleId]
    );
  };

  return (
    <fieldset className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <legend className="font-medium text-sm">
            {t('ws-members.role-placeholder')}
          </legend>
          <p className="mt-1 text-muted-foreground text-xs leading-4">
            {t('ws-members.invite_roles_description')}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-full">
          {t('ws-members.roles_selected', { count: roleIds.length })}
        </Badge>
      </div>

      {roles.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border p-1.5">
          {roles.map((role) => (
            <label
              key={role.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors active:scale-[0.99] ${selected.has(role.id) ? 'bg-dynamic-purple/10 text-foreground' : 'hover:bg-muted/50'}`}
            >
              <Checkbox
                aria-label={role.name}
                checked={selected.has(role.id)}
                onCheckedChange={() => toggleRole(role.id)}
              />
              <ShieldUser className="size-4 text-dynamic-purple" />
              <span className="min-w-0 flex-1 truncate font-medium text-sm">
                {role.name}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-center text-muted-foreground text-sm">
          {noRoleLabel}
        </div>
      )}
    </fieldset>
  );
}
