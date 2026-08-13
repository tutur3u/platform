'use client';

import { Search, ShieldUser } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const [query, setQuery] = useState('');
  const selected = new Set(roleIds);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRoles = normalizedQuery
    ? roles.filter((role) =>
        role.name.toLocaleLowerCase().includes(normalizedQuery)
      )
    : roles;

  const toggleRole = (roleId: string) => {
    onChange(
      selected.has(roleId)
        ? roleIds.filter((id) => id !== roleId)
        : [...roleIds, roleId]
    );
  };

  return (
    <Accordion type="single" collapsible defaultValue="workspace-roles">
      <AccordionItem
        value="workspace-roles"
        className="overflow-hidden rounded-xl border bg-background px-3"
      >
        <AccordionTrigger className="items-center py-3 hover:no-underline">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-dynamic-blue">
              <ShieldUser className="size-4" />
            </span>
            <span className="min-w-0 text-left">
              <span className="flex items-center gap-2">
                <span className="truncate">
                  {t('ws-members.role-placeholder')}
                </span>
                <Badge
                  variant="outline"
                  className="rounded-full font-normal text-[10px] uppercase tracking-wide"
                >
                  {t('ws-members.invite_roles_optional')}
                </Badge>
              </span>
              <span
                aria-live="polite"
                className="mt-0.5 block text-muted-foreground text-xs"
              >
                {t('ws-members.roles_selected', { count: roleIds.length })}
              </span>
            </span>
          </span>
        </AccordionTrigger>

        <AccordionContent className="space-y-3 border-t pt-3">
          <p className="text-muted-foreground text-xs leading-5">
            {t('ws-members.invite_roles_description')}
          </p>

          {roles.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Label
                    htmlFor="workspace-access-invite-role-search"
                    className="sr-only"
                  >
                    {t('ws-members.invite_roles_search')}
                  </Label>
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="workspace-access-invite-role-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('ws-members.invite_roles_search')}
                    className="h-10 rounded-lg pl-9"
                  />
                </div>
                {roleIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onChange([])}
                  >
                    {t('ws-members.clear_all_roles')}
                  </Button>
                ) : null}
              </div>

              {visibleRoles.length > 0 ? (
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-1.5">
                  {visibleRoles.map((role) => (
                    <label
                      key={role.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors active:scale-[0.99] ${selected.has(role.id) ? 'bg-dynamic-blue/10 text-foreground' : 'hover:bg-muted/50'}`}
                    >
                      <Checkbox
                        aria-label={role.name}
                        checked={selected.has(role.id)}
                        onCheckedChange={() => toggleRole(role.id)}
                      />
                      <ShieldUser className="size-4 text-dynamic-blue" />
                      <span className="min-w-0 flex-1 truncate font-medium text-sm">
                        {role.name}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                  {t('ws-members.invite_roles_no_match')}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              {noRoleLabel}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
