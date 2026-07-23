import type { LandingContent } from './landing-content';

export const vietnameseLandingContent = {
  meta: {
    description:
      'Một nền tảng duy nhất cho công việc, lịch trình, tài liệu và cả đội của bạn.',
    title: 'Tuturuuu - Nền tảng làm việc thông minh',
  },
  hero: {
    badge: 'Nền Tảng Làm Việc Thông Minh',
    description:
      'Một nền tảng duy nhất cho công việc, lịch trình, tài liệu và cả đội của bạn.',
    previewCards: [
      {
        items: ['Review thiết kế', 'Tích hợp API', 'Kiểm thử người dùng'],
        label: 'Task',
      },
      {
        items: ['Standup nhanh', 'Gọi khách hàng', 'Lập kế hoạch sprint'],
        label: 'Lịch',
      },
      {
        items: ['Cập nhật dự án', 'Đồng bộ nhanh', 'Góp ý'],
        label: 'Chat',
      },
      {
        items: ['87% năng suất', '24 task xong', '18.5h tập trung'],
        label: 'Analytics',
      },
    ],
    primaryCta: 'Bắt Đầu Miễn Phí',
    title: {
      line1: 'Làm ít hơn.',
      line2: 'Đạt nhiều hơn.',
    },
    trust: ['Mã Nguồn Mở', '10,000+ Commits', 'Miễn Phí Mãi Mãi'],
    video: {
      badge: 'Xem Demo',
      thumbnail: 'Demo Tuturuuu',
      title: 'Video Demo Tuturuuu',
      watchNow: 'Xem demo',
    },
  },
  problem: {
    stats: [
      { label: 'lãng phí mỗi ngày', value: '3 giờ' },
      { label: 'mất ngữ cảnh', value: '47%' },
      { label: 'app mỗi ngày', value: '12+' },
    ],
    subtitle: 'Tuturuuu gom tất cả vào một chỗ duy nhất.',
    title: 'Quá nhiều app. Quá ít thời gian. Mình hiểu mà.',
  },
  features: {
    apps: {
      nova: {
        description:
          'Rèn luyện kỹ năng prompt engineering, tham gia thử thách AI và nâng cao trình độ qua trải nghiệm thực hành.',
        highlights: ['Thử thách AI', 'Theo dõi kỹ năng', 'Bảng xếp hạng'],
        subtitle: 'Nền Tảng Học Tập',
        title: 'Nova',
      },
      tuchat: {
        description:
          'Trung tâm giao tiếp tích hợp, nơi AI tự động phát hiện các cam kết và chuyển đổi chúng thành công việc hoặc sự kiện lịch.',
        highlights: [
          'Chat nhóm',
          'Phân tích thông minh AI',
          'Tự động phân loại',
        ],
        subtitle: 'Giao Tiếp Thông Minh',
        title: 'Tuturuuu Chat',
      },
      tudo: {
        description:
          'Trung tâm quản lý công việc với cấu trúc phân cấp, tính năng ghi chú nhanh và tích hợp liền mạch với lịch trình.',
        highlights: ['Bảng Kanban', 'Công việc phân cấp', 'Quản lý dự án'],
        subtitle: 'Quản Lý Công Việc Thông Minh',
        title: 'Tuturuuu Tasks',
      },
      tufinance: {
        description:
          'Theo dõi chi tiêu, quản lý ngân sách và nhận thông tin phân tích về tình hình tài chính nhờ sức mạnh AI.',
        highlights: [
          'Theo dõi chi tiêu',
          'Lập kế hoạch ngân sách',
          'Phân tích tài chính',
        ],
        subtitle: 'Quản Lý Tài Chính',
        title: 'Tuturuuu Finance',
      },
      tumeet: {
        description:
          'Giải pháp cuộc họp toàn diện với lập kế hoạch cộng tác, định vị thông minh và tóm tắt tự động bằng AI.',
        highlights: ['Kế hoạch cuộc họp', 'Phiên âm AI', 'Theo dõi hành động'],
        subtitle: 'Cuộc Họp Thông Minh',
        title: 'Tuturuuu Meet',
      },
      tuplan: {
        description:
          'Tự động sắp xếp lịch trình dựa trên AI, phân bổ thời gian theo deadline, độ ưu tiên và nhịp làm việc riêng của bạn.',
        highlights: [
          'Đồng bộ Google Calendar',
          'Tự động sắp xếp lịch',
          'Phân chia khung thời gian',
        ],
        subtitle: 'Lịch Trình Thông Minh',
        title: 'Tuturuuu Calendar',
      },
    },
    subtitle: 'Một nền tảng cho mọi thứ bạn làm',
    title: 'Một không gian làm việc. Mọi phần của công việc.',
  },
  demo: {
    badge: 'Trải Nghiệm Trực Tiếp',
    panels: [
      {
        cta: 'Dùng Thử Lịch Thông Minh',
        details: [
          'Daily Standup',
          'Thời Gian Tập Trung: Deep Work',
          'Thuyết Trình Khách Hàng',
        ],
        subtitle: 'Sắp xếp lịch và phân chia thời gian bằng AI',
        title: 'Lịch Trình Thông Minh',
      },
      {
        cta: 'Dùng Thử Quản Lý Công Việc',
        details: [
          'Xem lại đề xuất marketing',
          'Triển khai tính năng đồng bộ lịch',
          'Lên kế hoạch hoạt động team building',
        ],
        subtitle: 'Tổ chức phân cấp với phân tích AI',
        title: 'Quản Lý Công Việc Thông Minh',
      },
      {
        cta: 'Chat với Mira',
        details: [
          'Mai mình có lịch gì?',
          'Tóm tắt việc tuần này',
          'Giúp mình ưu tiên deadline',
        ],
        subtitle: 'Trợ lý AI chủ động của bạn',
        title: 'Mira - Trợ Lý AI',
      },
    ],
    subtitle:
      'Trải nghiệm tương lai của làm việc. Đây là tính năng thật, dùng được ngay.',
    title: {
      highlight: 'Trong Thực Tế',
      part1: 'Xem Ngay',
    },
  },
  ai: {
    mira: {
      capabilities: ['Chủ động', 'Hiểu ngữ cảnh', 'Học liên tục'],
      description:
        'Mira là AI thực sự hiểu bạn. Cô ấy lên kế hoạch, suy nghĩ và hành động thay bạn, đồng bộ lịch, mục tiêu và tin nhắn để gợi ý đúng lúc bạn cần.',
      prompts: [
        'Đặt lịch standup 9h sáng mai',
        'Tóm tắt việc tuần này',
        'Giúp mình ưu tiên deadline',
      ],
      title: 'Gặp Mira - Trợ Lý AI Của Bạn',
    },
    subtitle: 'Gặp Mira, trợ lý AI thực sự hiểu cách bạn làm việc.',
    title: 'AI thông minh. Thật sự thông minh.',
  },
  pricing: {
    subtitle:
      'Mỗi workspace có gói riêng, tính phí theo người dùng. Tối đa 10 workspace miễn phí mỗi tài khoản.',
    tiers: [
      {
        cta: 'Dùng Ngay',
        description: 'Khởi đầu nhẹ nhàng',
        features: [
          'Quản lý công việc cơ bản',
          'Đồng bộ lịch (có giới hạn)',
          'Chat AI cơ bản',
          'Tạo mã QR',
        ],
        name: 'Miễn Phí',
        period: 'miễn phí mãi',
        price: '$0',
      },
      {
        badge: 'Phổ Biến Nhất',
        cta: 'Chọn Plus',
        description: 'Khi team cần phối hợp',
        features: [
          'Mọi thứ của Free +',
          'Whiteboard không giới hạn',
          'Lưu trữ Drive 20GB',
          'Phân quyền chi tiết',
        ],
        name: 'Plus',
        period: '/người/tháng',
        price: '$8',
      },
      {
        badge: 'Mạnh Nhất',
        cta: 'Chọn Pro',
        description: 'Cho team cần sức mạnh tối đa',
        features: [
          'Mọi thứ của Plus +',
          'AI không giới hạn',
          'Hỗ trợ ưu tiên',
          'Báo cáo & Analytics',
        ],
        name: 'Pro',
        period: '/người/tháng',
        price: '$15',
      },
    ],
    title: 'Giá rõ ràng. Không phí ẩn.',
  },
  socialProof: {
    backedBy: 'Được hỗ trợ bởi',
    cta: 'Xem trên GitHub',
    stats: [
      { label: 'Commits', value: '10,000+' },
      { label: 'Contributors', value: '30+' },
      { label: 'Năm phát triển', value: '3.5+' },
    ],
    title: 'Build in public',
  },
  cta: {
    description:
      'Hàng nghìn bạn đã thoát khỏi đống app lộn xộn và tìm lại sự tập trung. Thử miễn phí ngay, không cần thẻ nhé!',
    note: 'Không cần thẻ. Miễn phí mãi mãi.',
    primary: 'Dùng Thử Miễn Phí',
    secondary: 'Nói Chuyện Với Mình',
    title: 'Thử ngay đi, miễn phí mà!',
    trust: [
      'Mã nguồn mở & minh bạch',
      'Bảo mật cấp doanh nghiệp',
      'Tự host được luôn',
    ],
  },
} satisfies LandingContent;
