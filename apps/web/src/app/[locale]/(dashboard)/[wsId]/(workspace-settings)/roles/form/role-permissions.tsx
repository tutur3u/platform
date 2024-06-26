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
import { SectionProps } from './index';
import { permissionGroups } from './permissions';
import RolePermission from './role-permission';

export default function RoleFormPermissionsSection({
  form,
  enabledPermissionsCount,
}: SectionProps) {
  const t = useTranslations();
  const groups = permissionGroups(t);

  return (
    <>
      <Accordion
        type="multiple"
        defaultValue={groups.map((group) => `group-${group.id}`)}
      >
        {groups.map((group, idx) => (
          <Fragment key={`group-${group.id}`}>
            <AccordionItem value={`group-${group.id}`}>
              <AccordionTrigger>
                {group.title} (
                {enabledPermissionsCount.find((x) => x.id === group.id)
                  ?.count || 0}
                /{group.permissions.length})
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
