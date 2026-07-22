import { ShieldCheck } from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import type { permissionGroups } from '@tuturuuu/utils/permissions';

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
  return (
    <ScrollArea className="h-auto rounded-lg border sm:h-[52vh]">
      <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
        {groups.map((group) => (
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
                const adminLocked =
                  selectedPermissions.has('admin') && permission.id !== 'admin';

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
                        {permission.id === 'admin' ? (
                          <ShieldCheck className="h-4 w-4 text-dynamic-green" />
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
