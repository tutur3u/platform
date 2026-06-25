import type { TopicAnnouncementAttachmentDraft } from '@tuturuuu/internal-api';

export type PreviewableTopicAnnouncementAttachment =
  TopicAnnouncementAttachmentDraft & {
    previewUrl?: string;
  };

export function toTopicAnnouncementAttachmentDraft(
  attachment: PreviewableTopicAnnouncementAttachment
): TopicAnnouncementAttachmentDraft {
  const { previewUrl: _previewUrl, ...draft } = attachment;
  return draft;
}

export function canPreviewTopicAnnouncementAttachment(file: File) {
  return file.type.startsWith('image/') || file.type === 'application/pdf';
}
