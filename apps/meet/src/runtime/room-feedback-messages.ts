// Loading and recovery render before the complete locale asset is available.
export const roomFeedbackMessages = {
  en: {
    meet: {
      call: {
        back_to_meet: 'Back to Meet',
        connection_refresh: 'Refresh',
        join_error_hint:
          'We could not confirm your connection. Automatic reconnection attempts are limited. Check your network, then retry or leave.',
        join_error_title: 'Unable to connect to the meeting',
        join_loading_slow_title: 'Connecting is taking longer than expected',
        join_missing_hint:
          'This link may be incorrect, or you may not have access to the meeting. Check the invite with the host.',
        join_missing_title: 'Meeting not found or unavailable',
        preparing_call: 'Preparing your call',
      },
    },
  },
  vi: {
    meet: {
      call: {
        back_to_meet: 'Quay lại Meet',
        connection_refresh: 'Làm mới',
        join_error_hint:
          'Chưa thể xác nhận kết nối của bạn. Số lần tự động kết nối lại có giới hạn. Kiểm tra mạng, rồi thử lại hoặc rời đi.',
        join_error_title: 'Không thể kết nối với cuộc họp',
        join_loading_slow_title: 'Kết nối đang mất nhiều thời gian hơn dự kiến',
        join_missing_hint:
          'Liên kết có thể không đúng hoặc bạn không có quyền truy cập cuộc họp. Hãy kiểm tra lời mời với chủ phòng.',
        join_missing_title: 'Không tìm thấy cuộc họp hoặc không thể truy cập',
        preparing_call: 'Đang chuẩn bị cuộc gọi',
      },
    },
  },
} as const;
