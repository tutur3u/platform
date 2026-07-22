import { ShieldCheck } from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import type { permissionGroups } from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';

type PermissionGroups = ReturnType<typeof permissionGroups>;

type Props = {
  groups: PermissionGroups;
  onSelectedPermissionsChange: (selectedPermissions: Set<string>) => void;
  selectedPermissions: ReadonlySet<string>;
};

export function WorkspaceAccessPermissionChecklist({
  groups,
  onSelectedPermissionsChange,
  selectedPermissions,
}: Props) {
  const t = useTranslations() as (key: string) => string;
  const adminPermission = groups
    .flatMap((group) => group.permissions)
    .find((permission) => permission.id === 'admin');
  const regularGroups = groups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter(
        (permission) => permission.id !== 'admin'
      ),
    }))
    .filter((group) => group.permissions.length > 0);
  const adminEnabled = selectedPermissions.has('admin');

  return (
    <ScrollArea className="h-auto rounded-lg border sm:h-[52vh]">
      <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
        {adminPermission ? (
          <section className="rounded-lg border border-dynamic-green/30 bg-dynamic-green/5 p-3 sm:p-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={adminEnabled}
                onCheckedChange={(checked) => {
                  const next = new Set(selectedPermissions);
                  if (checked) next.add('admin');
                  else next.delete('admin');
                  onSelectedPermissionsChange(next);
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-4 text-dynamic-green" />
                  {adminPermission.title}
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  {adminPermission.description}
                </p>
                {adminEnabled ? (
                  <p className="mt-2 rounded-md bg-dynamic-green/10 px-2.5 py-2 text-dynamic-green text-sm">
                    {t('ws-roles.admin_enabled_description')}
                  </p>
                ) : null}
              </div>
            </label>
          </section>
        ) : null}

        {regularGroups.map((group) => (
          <section key={group.id} className="rounded-lg border p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <span className="text-muted-foreground">{group.icon}</span>
              <div>
                <h3 className="font-medium">{group.title}</h3>
                {group.description ? (
                  <p className="mt-1 text-muted-foreground text-sm">
                    {group.description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:mt-4">
              {group.permissions.map((permission) => {
                const checked = selectedPermissions.has(permission.id);
                const adminLocked = adminEnabled;

                return (
                  <label
                    key={permission.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-2.5 sm:p-3',
                      checked || adminLocked
                        ? 'border-dynamic-green/30 bg-dynamic-green/10'
                        : 'bg-background'
                    )}
                  >
                    <Checkbox
                      checked={checked || adminLocked}
                      disabled={adminLocked}
                      onCheckedChange={(nextChecked) => {
                        const next = new Set(selectedPermissions);

                        if (nextChecked) next.add(permission.id);
                        else next.delete(permission.id);

                        onSelectedPermissionsChange(next);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <span className="text-muted-foreground">
                          {permission.icon}
                        </span>
                        <span>{permission.title}</span>
                        {adminLocked ? (
                          <span className="ml-auto text-dynamic-green text-xs">
                            {t('ws-roles.granted_via_admin')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {permission.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}
