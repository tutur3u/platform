import { SectionProps } from './index';
import RolePermission from './role-permission';
import { permissionGroups } from '@/lib/permissions';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@repo/ui/components/ui/accordion';
import { FormField, FormItem } from '@repo/ui/components/ui/form';
import { Separator } from '@repo/ui/components/ui/separator';
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
      <div className="bg-dynamic-blue/10 border-dynamic-blue/20 text-dynamic-blue mb-2 rounded-md border p-2 text-center font-bold">
        {form.watch('name') || '-'}
      </div>

      <Accordion
        type="multiple"
        // defaultValue={groups.map((group) => `group-${group.id}`)}
      >
        {groups.map((group, idx) => (
          <Fragment key={`group-${group.id}`}>
            <AccordionItem value={`group-${group.id}`}>
              <AccordionTrigger>
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
