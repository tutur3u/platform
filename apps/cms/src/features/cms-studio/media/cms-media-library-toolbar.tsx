'use client';

import { File, ImageIcon, Music, Paperclip, Search } from '@tuturuuu/icons';
import type {
  WorkspaceExternalProjectMediaAttachment,
  WorkspaceExternalProjectMediaType,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';

const FILTERS: Array<{
  icon: typeof ImageIcon;
  value: WorkspaceExternalProjectMediaType;
}> = [
  { icon: File, value: 'all' },
  { icon: ImageIcon, value: 'image' },
  { icon: Music, value: 'audio' },
  { icon: Paperclip, value: 'other' },
];

export function CmsMediaLibraryToolbar({
  attachment,
  matchingTotal,
  search,
  setAttachment,
  setSearch,
  setType,
  totals,
  type,
}: {
  attachment: WorkspaceExternalProjectMediaAttachment;
  matchingTotal: number;
  search: string;
  setAttachment: (value: WorkspaceExternalProjectMediaAttachment) => void;
  setSearch: (value: string) => void;
  setType: (value: WorkspaceExternalProjectMediaType) => void;
  totals: Record<WorkspaceExternalProjectMediaType, number>;
  type: WorkspaceExternalProjectMediaType;
}) {
  const t = useTranslations('external-projects');

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/75 shadow-xs">
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Badge variant="secondary" className="mb-3 rounded-md">
              {t('epm.media_library_files_label')}
            </Badge>
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
              {t('epm.media_library_title')}
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
              {t('epm.media_library_description')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:min-w-72">
            <div className="bg-background px-4 py-3">
              <p className="text-muted-foreground text-xs">
                {t('epm.media_library_total_label')}
              </p>
              <p className="mt-1 font-semibold text-xl tabular-nums">
                {totals.all}
              </p>
            </div>
            <div className="bg-background px-4 py-3">
              <p className="text-muted-foreground text-xs">
                {t('epm.media_library_matching_label')}
              </p>
              <p className="mt-1 font-semibold text-xl tabular-nums">
                {matchingTotal}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-2 z-10 space-y-3 rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={type}
            onValueChange={(value) =>
              setType(value as WorkspaceExternalProjectMediaType)
            }
          >
            <TabsList className="h-auto max-w-full justify-start overflow-x-auto bg-muted/65">
              {FILTERS.map(({ icon: Icon, value }) => (
                <TabsTrigger key={value} value={value} className="h-8 px-2.5">
                  <Icon className="size-3.5" />
                  {t(`epm.media_filter_${value}`)}
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {totals[value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex min-w-0 flex-1 gap-2 lg:max-w-xl">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder={t('epm.media_library_search_placeholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={attachment}
              onValueChange={(value) =>
                setAttachment(value as WorkspaceExternalProjectMediaAttachment)
              }
            >
              <SelectTrigger className="h-9 w-36 sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('epm.media_attachment_all')}
                </SelectItem>
                <SelectItem value="attached">
                  {t('epm.media_attachment_attached')}
                </SelectItem>
                <SelectItem value="unattached">
                  {t('epm.media_attachment_unattached')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </>
  );
}
