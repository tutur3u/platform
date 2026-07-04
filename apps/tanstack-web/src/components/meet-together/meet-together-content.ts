import type { Locale } from '../../lib/platform/locale';

export type MeetTogetherContent = {
  meta: {
    description: string;
    title: string;
  };
  hero: {
    badge: string;
    description: string;
    headlineHighlight: string;
    headlineStart: string;
  };
  features: Array<{
    description: string;
    tone: 'blue' | 'purple' | 'green';
    title: string;
  }>;
  form: {
    agendaDescription: string;
    agendaTitle: string;
    createAccount: string;
    createPlan: string;
    datesLabel: string;
    endTimeLabel: string;
    extraFeaturesDescription: string;
    extraFeaturesTitle: string;
    loginToSave: string;
    newPlan: string;
    newPlanDescription: string;
    noTimezoneFound: string;
    selectTime: string;
    selectTimezone: string;
    signIn: string;
    startTimeLabel: string;
    timeZoneLabel: string;
    untitledPlan: string;
    whereDescription: string;
    whereTitle: string;
  };
  plans: {
    createAccount: string;
    loginRequired: string;
    loginRequiredDescription: string;
    signIn: string;
    title: string;
  };
};

const meetTogetherContent: Record<Locale, MeetTogetherContent> = {
  en: {
    meta: {
      description:
        'See how Tuturuuu Meet Together streamlines collaborative meetings.',
      title: 'Meet Together Overview',
    },
    hero: {
      badge: 'Meeting Coordination',
      description:
        'This plan will help you find the best time to meet together with your friends, family, or colleagues.',
      headlineHighlight: 'hassle-free',
      headlineStart: 'Find the best time slot for everyone,',
    },
    features: [
      {
        description: 'Automatic coordination',
        title: 'Smart Scheduling',
        tone: 'blue',
      },
      {
        description: 'Find the perfect time',
        title: 'Group Availability',
        tone: 'purple',
      },
      {
        description: 'Set up in minutes',
        title: 'Instant Setup',
        tone: 'green',
      },
    ],
    form: {
      agendaDescription:
        'Add agenda items and meeting objectives before sharing your plan.',
      agendaTitle: 'Agenda',
      createAccount: 'Create Account',
      createPlan: 'Create plan',
      datesLabel: 'Dates to meet together',
      endTimeLabel: 'Latest time',
      extraFeaturesDescription:
        'Enhance your meeting plan with additional details before saving it.',
      extraFeaturesTitle: 'Extra Features',
      loginToSave: 'Sign up or login into Tuturuuu to save your created plans.',
      newPlan: 'New plan',
      newPlanDescription:
        'This plan will help you find the best time to meet together with your friends, family, or colleagues.',
      noTimezoneFound: 'No timezones found',
      selectTime: 'Select a time',
      selectTimezone: 'Select time zone',
      signIn: 'Sign In',
      startTimeLabel: 'Soonest time',
      timeZoneLabel: 'Time zone',
      untitledPlan: 'Untitled plan',
      whereDescription:
        'Enable location suggestions and voting so participants can agree on where to meet.',
      whereTitle: 'Where TuMeet?',
    },
    plans: {
      createAccount: 'Create Account',
      loginRequired: 'Login required',
      loginRequiredDescription:
        'Please sign in to view and manage your meeting plans.',
      signIn: 'Sign In',
      title: 'Your plans',
    },
  },
  vi: {
    meta: {
      description:
        'Xem cách Tuturuuu Meet Together đơn giản hóa việc phối hợp cuộc họp.',
      title: 'Tổng quan Meet Together',
    },
    hero: {
      badge: 'Điều phối cuộc họp',
      description:
        'Kế hoạch này sẽ giúp bạn tìm ra thời gian tốt nhất để gặp nhau với bạn bè, gia đình hoặc đồng nghiệp.',
      headlineHighlight: 'không phiền hà',
      headlineStart: 'Tìm khung giờ tối ưu cho mọi người,',
    },
    features: [
      {
        description: 'Điều phối tự động',
        title: 'Lập lịch thông minh',
        tone: 'blue',
      },
      {
        description: 'Tìm thời gian hoàn hảo',
        title: 'Thời gian rảnh của nhóm',
        tone: 'purple',
      },
      {
        description: 'Thiết lập trong vài phút',
        title: 'Thiết lập tức thì',
        tone: 'green',
      },
    ],
    form: {
      agendaDescription:
        'Thêm các mục nghị sự và mục tiêu cuộc họp trước khi chia sẻ kế hoạch.',
      agendaTitle: 'Nội dung cuộc họp',
      createAccount: 'Tạo tài khoản',
      createPlan: 'Tạo kế hoạch',
      datesLabel: 'Ngày gặp nhau',
      endTimeLabel: 'Giờ muộn nhất',
      extraFeaturesDescription:
        'Bổ sung chi tiết để phối hợp cuộc họp dễ dàng hơn trước khi lưu.',
      extraFeaturesTitle: 'Tính năng bổ sung',
      loginToSave:
        'Đăng nhập hoặc đăng ký tài khoản Tuturuuu để lưu kế hoạch của bạn.',
      newPlan: 'Kế hoạch mới',
      newPlanDescription:
        'Kế hoạch này sẽ giúp bạn tìm ra thời gian tốt nhất để gặp nhau với bạn bè, gia đình hoặc đồng nghiệp.',
      noTimezoneFound: 'Không tìm thấy múi giờ',
      selectTime: 'Chọn thời gian',
      selectTimezone: 'Chọn múi giờ',
      signIn: 'Đăng nhập',
      startTimeLabel: 'Giờ sớm nhất',
      timeZoneLabel: 'Múi giờ',
      untitledPlan: 'Kế hoạch chưa đặt tên',
      whereDescription:
        'Bật gợi ý địa điểm và bình chọn để mọi người thống nhất nơi gặp.',
      whereTitle: 'Where TuMeet?',
    },
    plans: {
      createAccount: 'Tạo tài khoản',
      loginRequired: 'Yêu cầu đăng nhập',
      loginRequiredDescription:
        'Vui lòng đăng nhập để xem và quản lý các kế hoạch cuộc họp của bạn.',
      signIn: 'Đăng nhập',
      title: 'Kế hoạch của bạn',
    },
  },
};

export function getMeetTogetherContent(locale: Locale) {
  return meetTogetherContent[locale];
}
