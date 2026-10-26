'use client';

import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import {
  type AnnouncementFormValues,
  isTopicVideoUrlValid,
  NO_TEACHER,
} from './announcement-form-state';
import { TeacherUserPicker } from './teacher-user-picker';

type SetForm = (
  updater: (current: AnnouncementFormValues) => AnnouncementFormValues
) => void;

/** Supervisor assignment of the teacher who writes the topic. */
export function AnnouncementTeacherFields({
  disabled,
  form,
  setForm,
  wsId,
}: {
  disabled: boolean;
  form: AnnouncementFormValues;
  setForm: SetForm;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const hasTeacher = form.teacherWorkspaceUserId !== NO_TEACHER;

  return (
    <div className="space-y-3 rounded-md border bg-background p-4">
      <div>
        <h3 className="font-medium text-base">
          {t('teacher_assignment_title')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('teacher_assignment_helper')}
        </p>
      </div>
      <TeacherUserPicker
        disabled={disabled}
        noneValue={NO_TEACHER}
        onChange={(teacherWorkspaceUserId) =>
          setForm((current) => ({ ...current, teacherWorkspaceUserId }))
        }
        selected={form.teacherWorkspaceUserId}
        wsId={wsId}
      />
      {hasTeacher ? (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={form.notifyTeacher}
            disabled={disabled}
            id="topic-notify-teacher"
            onCheckedChange={(checked) =>
              setForm((current) => ({
                ...current,
                notifyTeacher: checked === true,
              }))
            }
          />
          <Label htmlFor="topic-notify-teacher">
            {t('teacher_notify_label')}
          </Label>
        </div>
      ) : null}
    </div>
  );
}

/** Course book and video link shared by the supervisor and teacher forms. */
export function TopicExtrasFields({
  courseBook,
  disabled,
  idPrefix,
  onCourseBookChange,
  onVideoUrlChange,
  videoUrl,
}: {
  courseBook: string;
  disabled: boolean;
  idPrefix: string;
  onCourseBookChange: (value: string) => void;
  onVideoUrlChange: (value: string) => void;
  videoUrl: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const videoInvalid = !isTopicVideoUrlValid(videoUrl);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-course-book`}>
          {t('course_book_label')}
        </Label>
        <Input
          disabled={disabled}
          id={`${idPrefix}-course-book`}
          maxLength={200}
          onChange={(event) => onCourseBookChange(event.target.value)}
          placeholder={t('course_book_placeholder')}
          value={courseBook}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-video-url`}>{t('video_url_label')}</Label>
        <Input
          aria-invalid={videoInvalid}
          disabled={disabled}
          id={`${idPrefix}-video-url`}
          inputMode="url"
          maxLength={2000}
          onChange={(event) => onVideoUrlChange(event.target.value)}
          placeholder={t('video_url_placeholder')}
          value={videoUrl}
        />
        {videoInvalid ? (
          <p className="text-dynamic-red text-xs">{t('video_url_invalid')}</p>
        ) : null}
      </div>
    </div>
  );
}
