'use client';

import { Pencil, Plus, Trash2 } from '@tuturuuu/icons';
import type {
  TopicAnnouncementTemplatePayload,
  TopicAnnouncementTemplateRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TemplateFormDialog } from './template-form-dialog';

interface TopicAnnouncementsTemplatesProps {
  groups: UserGroup[];
  isDeleting: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onCreate: (payload: TopicAnnouncementTemplatePayload) => void;
  onDelete: (templateId: string) => void;
  onUpdate: (
    templateId: string,
    payload: Partial<TopicAnnouncementTemplatePayload>
  ) => void;
  templates: TopicAnnouncementTemplateRecord[];
}

export function TopicAnnouncementsTemplates({
  groups,
  isDeleting,
  isLoading,
  isSaving,
  onCreate,
  onDelete,
  onUpdate,
  templates,
}: TopicAnnouncementsTemplatesProps) {
  const t = useTranslations('ws-topic-announcements');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] =
    useState<TopicAnnouncementTemplateRecord | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-base">{t('templates_title')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('templates_description')}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('template_create')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('template_name')}</TableHead>
              <TableHead>{t('announcement_title')}</TableHead>
              <TableHead>{t('classLabel')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <TableRow key={`template-loading-${index}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-56" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>{template.title}</TableCell>
                <TableCell>{template.group?.name ?? t('none')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      aria-label={t('template_edit_title')}
                      className="h-8 w-8"
                      onClick={() => setEditing(template)}
                      size="icon"
                      title={t('template_edit_title')}
                      variant="outline"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={t('remove_announcement')}
                      className="h-8 w-8"
                      disabled={isDeleting}
                      onClick={() => onDelete(template.id)}
                      size="icon"
                      title={t('remove_announcement')}
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && templates.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={4}
                >
                  {t('templates_empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <TemplateFormDialog
        groups={groups}
        isOpen={createOpen}
        isSaving={isSaving}
        onClose={() => setCreateOpen(false)}
        onSave={(payload) => {
          onCreate(payload);
          setCreateOpen(false);
        }}
        titleKey="template_create_title"
      />

      <TemplateFormDialog
        groups={groups}
        initial={editing}
        isOpen={Boolean(editing)}
        isSaving={isSaving}
        onClose={() => setEditing(null)}
        onSave={(payload) => {
          if (!editing) return;
          onUpdate(editing.id, payload);
          setEditing(null);
        }}
        titleKey="template_edit_title"
      />
    </div>
  );
}
