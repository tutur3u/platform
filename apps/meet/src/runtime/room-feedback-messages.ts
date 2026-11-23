// Loading and recovery render before the complete locale asset is available.
export const roomFeedbackMessages = {
  en: {
    meet: {
      call: {
        back_to_meet: 'Back to Meet',
        connecting: 'Connecting…',
        connection_refresh: 'Refresh',
        join_error_hint:
          'We could not connect you to the meeting. Check your internet connection, then try again.',
        join_error_title: 'Unable to connect to the meeting',
        join_loading_slow_title: 'Still working on it',
        join_missing_hint:
          'This link may be incorrect, or you may not have access to the meeting. Check the invite with the host.',
        join_missing_title: 'Meeting not found or unavailable',
        preparing_call: 'Setting up your meeting',
      },
    },
  },
  vi: {
    meet: {
      call: {
        back_to_meet: 'Quay lại Meet',
        connecting: 'Đang kết nối…',
        connection_refresh: 'Làm mới',
        join_error_hint:
          'Chúng tôi không thể kết nối bạn với cuộc họp. Hãy kiểm tra kết nối internet rồi thử lại.',
        join_error_title: 'Không thể kết nối với cuộc họp',
        join_loading_slow_title: 'Vẫn đang xử lý',
        join_missing_hint:
          'Liên kết có thể không đúng hoặc bạn không có quyền truy cập cuộc họp. Hãy kiểm tra lời mời với chủ phòng.',
        join_missing_title: 'Không tìm thấy cuộc họp hoặc không thể truy cập',
        preparing_call: 'Đang thiết lập cuộc họp',
      },
    },
  },
} as const;
