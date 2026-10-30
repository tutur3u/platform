import type { LegalLocale, Subprocessor } from './types';

export const mobileRevisionCopy: Record<
  LegalLocale,
  { paragraphs: string[]; processors: Subprocessor[] }
> = {
  en: {
    paragraphs: [
      '**Push notifications.** If you sign in and turn on push notifications, your device is registered with Google Firebase Cloud Messaging and Firebase Installations so we can deliver notifications. This sends a push token and an installation identifier to Google, and Google delivers the notification content to your device. It happens only after you sign in and turn on push, and it does not depend on your analytics choice. Before you sign in, the app does not contact Firebase. You can turn push off in the app or in your device settings.',
      "**Analytics and crash reports.** Firebase Analytics and Crashlytics are off until you choose Allow. If you do not allow, no analytics or crash data is sent. If you allow, we receive app and device identifiers (including a Firebase installation identifier), usage events, crash reports and device and operating-system information to understand how the app is used and to fix crashes. Google keeps this data for at most two months at the user level; we have turned off Google's advertising and data-sharing features for it. You can change your choice at any time in Settings > Preferences > Privacy > Share analytics and crash reports; when you turn it off, collection stops and unsent crash reports are deleted. Test builds do not collect.",
    ],
    processors: [
      {
        name: 'Firebase Analytics and Crashlytics (Google)',
        purpose:
          'Mobile app usage analytics and crash reporting, only after the user chooses Allow in the app.',
        dataCategories: [
          'app and device identifiers (including a Firebase installation identifier); usage events; crash reports and diagnostics; device and operating-system metadata. Retention at the provider: up to 2 months at user level.',
        ],
        regions: ['Provider-operated regions'],
        privacyUrl: 'https://firebase.google.com/support/privacy',
        changedAt: '2026-12-02',
      },
      {
        name: 'Firebase Cloud Messaging and Firebase Installations (Google)',
        purpose:
          'Delivery of push notifications to the mobile app, only after the user signs in and turns on push notifications.',
        dataCategories: [
          'push notification token; installation identifier; notification payload (the content delivered).',
        ],
        regions: ['Provider-operated regions'],
        privacyUrl: 'https://firebase.google.com/support/privacy',
        changedAt: '2026-12-02',
      },
    ],
  },
  vi: {
    paragraphs: [
      '**Thông báo đẩy.** Nếu bạn đăng nhập và bật thông báo đẩy, thiết bị của bạn được đăng ký với Google Firebase Cloud Messaging và Firebase Installations để chúng tôi gửi thông báo. Việc này gửi mã thông báo đẩy và mã định danh bản cài đặt đến Google, và Google chuyển nội dung thông báo đến thiết bị của bạn. Chỉ xảy ra sau khi bạn đăng nhập và bật thông báo đẩy, và không phụ thuộc vào lựa chọn phân tích của bạn. Trước khi đăng nhập, ứng dụng không kết nối đến Firebase. Bạn có thể tắt thông báo đẩy trong ứng dụng hoặc trong cài đặt thiết bị.',
      '**Phân tích và báo cáo sự cố.** Firebase Analytics và Crashlytics tắt cho đến khi bạn chọn Cho phép. Nếu không cho phép, không có dữ liệu phân tích hoặc sự cố nào được gửi. Nếu cho phép, chúng tôi nhận mã định danh ứng dụng và thiết bị (gồm mã định danh bản cài đặt Firebase), sự kiện sử dụng, báo cáo sự cố và thông tin thiết bị, hệ điều hành để hiểu cách ứng dụng được dùng và sửa lỗi sập ứng dụng. Google giữ dữ liệu này tối đa hai tháng ở cấp người dùng; chúng tôi đã tắt các tính năng quảng cáo và chia sẻ dữ liệu của Google cho dữ liệu này. Bạn có thể đổi lựa chọn bất cứ lúc nào tại Cài đặt > Tùy chọn > Quyền riêng tư > Chia sẻ dữ liệu phân tích và báo cáo sự cố; khi tắt, việc thu thập dừng lại và các báo cáo sự cố chưa gửi sẽ bị xóa. Bản dựng thử nghiệm không thu thập.',
    ],
    processors: [
      {
        name: 'Firebase Analytics and Crashlytics (Google)',
        purpose:
          'Phân tích mức độ sử dụng ứng dụng di động và báo cáo sự cố, chỉ sau khi người dùng chọn Cho phép trong ứng dụng.',
        dataCategories: [
          'mã định danh ứng dụng và thiết bị (gồm mã định danh bản cài đặt Firebase); sự kiện sử dụng; báo cáo sự cố và chẩn đoán; thông tin thiết bị và hệ điều hành. Thời gian lưu tại nhà cung cấp: tối đa 2 tháng ở cấp người dùng.',
        ],
        regions: ['Provider-operated regions'],
        privacyUrl: 'https://firebase.google.com/support/privacy',
        changedAt: '2026-12-02',
      },
      {
        name: 'Firebase Cloud Messaging and Firebase Installations (Google)',
        purpose:
          'Gửi thông báo đẩy đến ứng dụng di động, chỉ sau khi người dùng đăng nhập và bật thông báo đẩy.',
        dataCategories: [
          'mã thông báo đẩy; mã định danh bản cài đặt; nội dung thông báo được gửi.',
        ],
        regions: ['Provider-operated regions'],
        privacyUrl: 'https://firebase.google.com/support/privacy',
        changedAt: '2026-12-02',
      },
    ],
  },
};
