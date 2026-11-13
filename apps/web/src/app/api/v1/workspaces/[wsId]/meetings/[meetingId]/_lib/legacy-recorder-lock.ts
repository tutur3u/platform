import { NextResponse } from 'next/server';

/**
 * The legacy meeting-page recorder is retired: it captured audio without
 * per-speaker consent. It never starts a new recording session or accepts new
 * audio. Existing recordings stay readable and deletable; Meet is the
 * consented recording path.
 */
export const LEGACY_MEETING_RECORDER_RETIRED_CODE =
  'LEGACY_MEETING_RECORDER_RETIRED';

const MESSAGES = {
  en: 'The old meeting recorder is retired and no longer accepts new recordings or uploads. Use Meet to record. Existing recordings stay available.',
  vi: 'Trình ghi âm cuộc họp cũ đã ngừng hoạt động và không còn nhận bản ghi hoặc tệp tải lên mới. Hãy dùng Meet để ghi âm. Các bản ghi hiện có vẫn được giữ nguyên.',
} as const;

export function legacyRecorderRetiredResponse(request: Request) {
  const locale = request.headers
    .get('accept-language')
    ?.trim()
    .toLowerCase()
    .startsWith('vi')
    ? 'vi'
    : 'en';
  return NextResponse.json(
    { code: LEGACY_MEETING_RECORDER_RETIRED_CODE, error: MESSAGES[locale] },
    { status: 403 }
  );
}
