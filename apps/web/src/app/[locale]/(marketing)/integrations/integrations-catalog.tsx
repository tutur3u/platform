'use client';

import {
  ArrowUpRight,
  CalendarDays,
  Code,
  Contact,
  Files,
  ListTodo,
  Mail,
  MessagesSquare,
  PanelsTopLeft,
  Search,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { CatalogIntegration } from '@tuturuuu/utils/integrations-catalog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type CatalogEntry = Pick<
  CatalogIntegration,
  'id' | 'category' | 'group' | 'status'
> & {
  href?: string;
};

const groups = ['google', 'microsoft', 'other'] as const;

const categoryIcons = {
  calendar: CalendarDays,
  chat: MessagesSquare,
  contacts: Contact,
  development: Code,
  files: Files,
  mail: Mail,
  productivity: PanelsTopLeft,
  projects: ListTodo,
} satisfies Record<CatalogEntry['category'], typeof Mail>;

const statusVariants = {
  available: 'default',
  coming_soon: 'secondary',
  early_access: 'outline',
} as const;

export function IntegrationsCatalog({ entries }: { entries: CatalogEntry[] }) {
  const t = useTranslations('marketing-integrations');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const search = query.trim().toLocaleLowerCase();
  const visible = entries.filter(
    (entry) =>
      (status === 'all' || status === entry.status) &&
      [
        t(`names.${entry.id}`),
        t(`groups.${entry.group}`),
        t(`categories.${entry.category}`),
      ].some((label) => label.toLocaleLowerCase().includes(search))
  );
  const hasEarlyAccess = entries.some(
    (entry) => entry.status === 'early_access'
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t('search')}
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            type="search"
            value={query}
          />
        </div>
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger
            aria-label={t('filter')}
            className="w-full sm:w-auto sm:min-w-48"
          >
            <SelectValue placeholder={t('filter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all_statuses')}</SelectItem>
            <SelectItem value="available">{t('statuses.available')}</SelectItem>
            {hasEarlyAccess && (
              <SelectItem value="early_access">
                {t('statuses.early_access')}
              </SelectItem>
            )}
            <SelectItem value="coming_soon">
              {t('statuses.coming_soon')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {visible.length === 0 && (
        <p
          className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm"
          role="status"
        >
          {t('empty')}
        </p>
      )}
      {groups.map((group) => {
        const groupEntries = visible.filter((entry) => entry.group === group);
        if (!groupEntries.length) return null;
        return (
          <section
            aria-labelledby={`integrations-${group}`}
            className="space-y-3"
            key={group}
          >
            <h2 className="font-semibold text-lg" id={`integrations-${group}`}>
              {t(`groups.${group}`)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groupEntries.map((entry) => {
                const Icon = categoryIcons[entry.category];
                const name = t(`names.${entry.id}`);
                return (
                  <li key={entry.id}>
                    <Card className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                          <Icon aria-hidden="true" className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm">{name}</h3>
                          <p className="text-muted-foreground text-sm">
                            {t(`categories.${entry.category}`)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                        <Badge variant={statusVariants[entry.status]}>
                          {t(`statuses.${entry.status}`)}
                        </Badge>
                        {entry.href && (
                          <Button asChild size="sm" variant="outline">
                            <a
                              aria-label={t('manage_integration', { name })}
                              href={entry.href}
                            >
                              {t('manage')}
                              <ArrowUpRight
                                aria-hidden="true"
                                className="size-3.5"
                              />
                            </a>
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
