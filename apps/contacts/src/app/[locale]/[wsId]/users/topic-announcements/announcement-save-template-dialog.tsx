'use client';

import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { AnnouncementFormValues } from './announcement-form-state';
import {
  TemplateFormDialog,
  type TemplateFormValues,
} from './template-form-dialog';
import { NO_GROUP } from './topic-announcements-form-constants';

interface Props {
  form: AnnouncementFormValues;
  groups: UserGroup[];
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSaveTemplate: (values: TemplateFormValues) => void;
}

export function AnnouncementSaveTemplateDialog({
  form,
  groups,
  isOpen,
  isSaving,
  onClose,
  onSaveTemplate,
}: Props) {
  return (
    <TemplateFormDialog
      groups={groups}
      initial={{
        defaultContactIds: form.contactIds,
        endTime: form.endTime,
        groupId: form.groupId,
        name: '',
        place: form.place,
        room: form.room,
        startTime: form.startTime,
        title: form.title,
        topic: form.topic,
      }}
      isOpen={isOpen}
      isSaving={isSaving}
      onClose={onClose}
      onSave={(payload) => {
        onSaveTemplate({
          defaultContactIds: payload.defaultContactIds ?? [],
          endTime: payload.endTime ?? '',
          groupId: payload.groupId ?? NO_GROUP,
          name: payload.name,
          place: payload.place ?? '',
          room: payload.room ?? '',
          startTime: payload.startTime ?? '',
          title: payload.title,
          topic: payload.topic ?? '',
        });
        onClose();
      }}
      titleKey="template_save_from_form_title"
    />
  );
}
