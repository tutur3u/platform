import { useLocale } from 'next-intl';

export const largeRoomLabels = {
  en: {
    admit_all: 'Admit all ({count})',
    deny_all: 'Deny all ({count})',
    waiting_capacity:
      '{count} still waiting because the meeting is at capacity.',
    lock_mics: 'Lock microphones',
    lock_cameras: 'Lock cameras',
    lock_screens: 'Lock screen sharing',
    mic_locked_hint: 'The host has locked microphones',
    camera_locked_hint: 'The host has locked cameras',
    screen_locked_hint: 'The host has locked screen sharing',
    allow_mic: 'Allow microphone',
    allow_camera: 'Allow camera',
    allow_screen: 'Allow screen sharing',
    media_overrides: 'Media permissions for {name}',
    skip_lobby: 'Admit everyone automatically',
    previous_page: 'Previous page',
    next_page: 'Next page',
    stage_pages: 'Participant video pages',
    stage_page: 'Page {page} of {count}',
    settings_media: 'Audio & video',
    settings_permissions: 'Permissions & locks',
    settings_connection: 'Connection & costs',
    settings_chat: 'Chat & recording',
    settings_public: 'Public access & AI memory',
    settings_large_room: 'Large rooms & bandwidth',
    settings_large_room_hint:
      'Video follows your current page. Adaptive bandwidth keeps audio available when your connection slows.',
  },
  vi: {
    admit_all: 'Cho tất cả vào ({count})',
    deny_all: 'Từ chối tất cả ({count})',
    waiting_capacity: 'Còn {count} người đang chờ vì cuộc họp đã đủ chỗ.',
    lock_mics: 'Khóa micrô',
    lock_cameras: 'Khóa camera',
    lock_screens: 'Khóa chia sẻ màn hình',
    mic_locked_hint: 'Người chủ trì đã khóa micrô',
    camera_locked_hint: 'Người chủ trì đã khóa camera',
    screen_locked_hint: 'Người chủ trì đã khóa chia sẻ màn hình',
    allow_mic: 'Cho phép bật micrô',
    allow_camera: 'Cho phép bật camera',
    allow_screen: 'Cho phép chia sẻ màn hình',
    media_overrides: 'Quyền sử dụng thiết bị của {name}',
    skip_lobby: 'Tự động cho mọi người vào',
    previous_page: 'Trang trước',
    next_page: 'Trang sau',
    stage_pages: 'Các trang video của người tham gia',
    stage_page: 'Trang {page} trên {count}',
    settings_media: 'Âm thanh và video',
    settings_permissions: 'Quyền và khóa thiết bị',
    settings_connection: 'Kết nối và chi phí',
    settings_chat: 'Trò chuyện và ghi hình',
    settings_public: 'Truy cập công khai và bộ nhớ AI',
    settings_large_room: 'Cuộc họp đông người và băng thông',
    settings_large_room_hint:
      'Video chỉ hiển thị trên trang bạn đang xem. Khi kết nối chậm, hệ thống tự điều chỉnh video để duy trì âm thanh.',
  },
} as const;

export function useLargeRoomLabels() {
  const locale = useLocale();
  const labels = locale?.startsWith('vi')
    ? largeRoomLabels.vi
    : largeRoomLabels.en;
  return (
    key: keyof typeof labels,
    values: Record<string, string | number> = {}
  ) =>
    labels[key].replace(/\{(\w+)\}/g, (match, key: string) =>
      String(values[key] ?? match)
    );
}
