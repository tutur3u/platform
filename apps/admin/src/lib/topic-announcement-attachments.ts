const GENERATED_UUID_FILENAME_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(?=.)/iu;

export function normalizeTopicAnnouncementAttachmentFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/u).pop()?.trim() ?? '';
  const withoutGeneratedPrefix = baseName.replace(
    GENERATED_UUID_FILENAME_PREFIX,
    ''
  );

  return withoutGeneratedPrefix.trim() || baseName || 'attachment';
}
