import { SectionProps } from './index';
import RolePermission from './role-permission';
import { permissionGroups } from '@/lib/permissions';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tutur3u/ui/components/ui/accordion';
import { FormField, FormItem } from '@tutur3u/ui/components/ui/form';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

export default function RoleFormPermissionsSection({
  wsId,
  user,
  form,
  enabledPermissionsCount,
}: SectionProps) {
  const t = useTranslations();
  const groups = permissionGroups({ t, wsId, user });

  return (
    <>
      <div className="mb-2 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 p-2 text-center font-bold text-dynamic-blue">
        {form.watch('name') || '-'}
      </div>

      <div className="rounded border p-4">
        <RolePermission
          icon={<ShieldCheck />}
          title={t('ws-roles.admin')}
          description={t('ws-roles.admin_description')}
          value={groups.every((group) =>
            group.permissions.every(
              (permission) =>
                form.watch(`permissions.${permission.id}`) === true
            )
          )}
          onChange={(value) => {
            groups.forEach((group) =>
              group.permissions.forEach((permission) => {
                form.setValue(`permissions.${permission.id}`, value, {
                  shouldDirty: true,
                });
              })
            );
            form.trigger('permissions');
          }}
        />
      </div>

      <Separator className="my-4" />

      <Accordion
        type="multiple"
        // defaultValue={groups.map((group) => `group-${group.id}`)}
      >
        {groups.map((group, idx) => (
          <Fragment key={`group-${group.id}`}>
            <AccordionItem value={`group-${group.id}`}>
              <AccordionTrigger>
                <div className="flex items-start justify-start gap-2">
                  {group.icon}
                  <div className="flex flex-wrap items-center gap-2">
                    {group.title}
                    <span className="flex items-center gap-1 rounded border px-1 text-sm font-bold">
                      <span className="text-dynamic-orange">
                        {enabledPermissionsCount.find((x) => x.id === group.id)
                          ?.count || 0}
                      </span>
                      <span className="opacity-50">/</span>
                      <span className="text-dynamic-blue">
                        {group.permissions.length}
                      </span>
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {group.permissions.map((permission, idx) => (
                  <Fragment
                    key={`group-${group.id}-permission-${permission.id}`}
                  >
                    <FormField
                      control={form.control}
                      name={`permissions.${permission.id}`}
                      render={({ field }) => (
                        <FormItem>
                          <RolePermission
                            icon={permission.icon}
                            title={permission.title}
                            description={permission.description}
                            value={field.value}
                            onChange={(value) => {
                              field.onChange(value);
                              form.trigger('permissions');
                            }}
                            disabled={permission?.disabled}
                          />
                        </FormItem>
                      )}
                    />
                    {idx !== group.permissions.length - 1 && (
                      <Separator className="my-4" />
                    )}
                  </Fragment>
                ))}
              </AccordionContent>
            </AccordionItem>
            {idx !== groups.length - 1 && <div className="mb-2" />}
          </Fragment>
        ))}
      </Accordion>
    </>
  );
}
