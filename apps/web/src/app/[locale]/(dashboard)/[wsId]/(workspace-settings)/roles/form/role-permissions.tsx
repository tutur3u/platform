import { CheckCircle, Info, Lock, Shield, ShieldCheck } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { FormField, FormItem } from '@tuturuuu/ui/form';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { permissionGroups } from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { Fragment, useMemo, useState } from 'react';
import type { SectionProps } from './index';
import RolePermission from './role-permission';

export default function RoleFormPermissionsSection({
  wsId,
  user,
  form,
  enabledPermissionsCount,
}: SectionProps) {
  const t = useTranslations();
  const groups = permissionGroups({
    t: t as (key: string) => string,
    wsId,
    user,
  });

  const [searchQuery, setSearchQuery] = useState('');

  const allPermissionsEnabled = groups.every((group) =>
    group.permissions.every(
      (permission) => form.watch(`permissions.${permission.id}`) === true
    )
  );

  // Check if admin permission is enabled
  const isAdminEnabled = form.watch('permissions.admin') === true;

  const totalPermissions = groups.reduce(
    (acc, group) => acc + group.permissions.length,
    0
  );

  const totalEnabledPermissions = isAdminEnabled
    ? totalPermissions
    : enabledPermissionsCount.reduce((acc, group) => acc + group.count, 0);

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;

    const query = searchQuery.toLowerCase().trim();
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (permission) =>
            permission.title.toLowerCase().includes(query) ||
            permission.description.toLowerCase().includes(query) ||
            group.title.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [groups, searchQuery]);

  const handleToggleAll = (value: boolean) => {
    groups.forEach((group) => {
      group.permissions.forEach((permission) => {
        form.setValue(`permissions.${permission.id}`, value, {
          shouldDirty: true,
        });
      });
    });
    form.trigger('permissions');
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Permissions Header */}
      <div className="space-y-3 rounded-lg border bg-linear-to-br from-background via-background to-foreground/2 p-4 shadow-sm md:space-y-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-purple to-dynamic-blue shadow-lg sm:h-14 sm:w-14">
              <Shield className="h-6 w-6 text-background sm:h-7 sm:w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="font-semibold text-base sm:text-lg">
                  {form.watch('name') || t('ws-roles.unnamed_role')}
                </Label>
                <Badge
                  variant="secondary"
                  className="font-semibold text-xs sm:text-sm"
                >
                  {totalEnabledPermissions}/{totalPermissions}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t('ws-roles.permissions_description')}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant={allPermissionsEnabled ? 'outline' : 'default'}
            size="sm"
            onClick={() => handleToggleAll(!allPermissionsEnabled)}
            className="w-full shrink-0 sm:w-auto"
          >
            <CheckCircle className="mr-1.5 h-4 w-4 sm:mr-2" />
            <span className="text-sm sm:text-base">
              {allPermissionsEnabled
                ? t('ws-roles.deselect_all')
                : t('ws-roles.select_all')}
            </span>
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex gap-2.5 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-3 sm:gap-3 sm:p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-purple sm:h-5 sm:w-5" />
          <div className="text-sm">
            <p className="font-medium text-dynamic-purple">
              {t('ws-roles.permissions_info_title')}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t('ws-roles.permissions_info_description')}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Admin Permission - Bypasses all other permissions */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2 font-semibold text-base">
          <ShieldCheck className="h-4 w-4" />
          {t('ws-roles.quick_actions')}
        </Label>

        <FormField
          control={form.control}
          name="permissions.admin"
          render={({ field }) => (
            <FormItem>
              <div
                className={cn(
                  'rounded-lg border p-3 transition-colors sm:p-4',
                  field.value
                    ? 'border-dynamic-green/20 bg-dynamic-green/5'
                    : 'bg-background'
                )}
              >
                <RolePermission
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title={t('ws-roles.admin')}
                  description={t('ws-roles.admin_description')}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.trigger('permissions');
                  }}
                />
              </div>
            </FormItem>
          )}
        />
      </div>

      {/* Admin Override Notice */}
      {isAdminEnabled && (
        <div className="flex gap-2.5 rounded-lg border border-dynamic-green/30 bg-dynamic-green/10 p-3 sm:gap-3 sm:p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-green" />
          <div className="text-sm">
            <p className="font-semibold text-dynamic-green">
              {t('ws-roles.admin_enabled_title')}
            </p>
            <p className="text-foreground/80 leading-relaxed">
              {t('ws-roles.admin_enabled_description')}
            </p>
          </div>
        </div>
      )}

      <Separator />

      {/* Search Permissions */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2 font-semibold text-base">
          <Shield className="h-4 w-4" />
          {t('ws-roles.permission_groups')}
        </Label>

        <div className="relative">
          <input
            type="text"
            placeholder={t('ws-roles.search_permissions_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {/* Permission Groups */}
      {filteredGroups.length > 0 ? (
        <Accordion
          type="multiple"
          defaultValue={filteredGroups.map((group) => `group-${group.id}`)}
        >
          {filteredGroups.map((group, idx) => {
            const count =
              enabledPermissionsCount.find((x) => x.id === group.id)?.count ||
              0;
            const groupEnabledCount = isAdminEnabled
              ? group.permissions.length
              : count;
            const allGroupEnabled =
              groupEnabledCount === group.permissions.length;

            return (
              <Fragment key={`group-${group.id}`}>
                <AccordionItem
                  value={`group-${group.id}`}
                  className="rounded-lg border bg-background px-3 sm:px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex w-full flex-col gap-2 pr-2 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex flex-1 items-start gap-2.5 sm:items-center sm:gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-10 sm:w-10',
                            allGroupEnabled
                              ? 'bg-dynamic-green/20 text-dynamic-green'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {group.icon}
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className="font-semibold text-sm sm:text-base">
                            {group.title}
                          </div>
                          <div className="text-muted-foreground text-xs sm:text-sm">
                            {group.description}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 font-semibold',
                          allGroupEnabled &&
                            'bg-dynamic-green/20 text-dynamic-green'
                        )}
                      >
                        {groupEnabledCount}/{group.permissions.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pt-2 pb-3 sm:space-y-3 sm:pb-4">
                    {group.permissions.map((permission) => (
                      <Fragment
                        key={`group-${group.id}-permission-${permission.id}`}
                      >
                        <FormField
                          control={form.control}
                          name={`permissions.${permission.id}`}
                          render={({ field }) => (
                            <FormItem>
                              <div
                                className={cn(
                                  'rounded-lg border p-3 transition-colors sm:p-4',
                                  isAdminEnabled && permission.id !== 'admin'
                                    ? 'border-dynamic-green/30 bg-dynamic-green/10 opacity-75'
                                    : field.value
                                      ? 'border-dynamic-green/20 bg-dynamic-green/5'
                                      : 'bg-muted/30'
                                )}
                              >
                                {isAdminEnabled &&
                                  permission.id !== 'admin' && (
                                    <div className="mb-2 flex items-center gap-1.5 text-dynamic-green text-xs">
                                      <Lock className="h-3 w-3" />
                                      <span>
                                        {t('ws-roles.granted_via_admin')}
                                      </span>
                                    </div>
                                  )}
                                <RolePermission
                                  icon={permission.icon}
                                  title={permission.title}
                                  description={permission.description}
                                  value={isAdminEnabled ? true : field.value}
                                  onChange={(value) => {
                                    field.onChange(value);
                                    form.trigger('permissions');
                                  }}
                                  disabled={
                                    permission?.disabled ||
                                    (isAdminEnabled &&
                                      permission.id !== 'admin')
                                  }
                                />
                              </div>
                            </FormItem>
                          )}
                        />
                      </Fragment>
                    ))}
                  </AccordionContent>
                </AccordionItem>
                {idx !== filteredGroups.length - 1 && (
                  <div className="my-2 sm:my-3" />
                )}
              </Fragment>
            );
          })}
        </Accordion>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center sm:p-8">
          <Shield className="mx-auto mb-2 h-10 w-10 text-muted-foreground sm:mb-3 sm:h-12 sm:w-12" />
          <p className="mb-1 font-semibold text-sm sm:mb-2 sm:text-base">
            {t('ws-roles.no_permissions_found')}
          </p>
          <p className="text-muted-foreground text-sm">
            {t('ws-roles.try_different_search')}
          </p>
        </div>
      )}
    </div>
  );
}
