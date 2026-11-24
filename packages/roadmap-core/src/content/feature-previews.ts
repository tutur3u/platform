/**
 * Feature previews for the Releases tab: real screens of the current Sorbet
 * design, captured from fixtures (the Flutter app through
 * apps/mobile/test/store_screenshots, the web apps from a local fixture
 * stack). The capture scripts write one manifest per source under
 * src/assets/previews/<source>/manifest.json; the build supplies the parsed
 * manifests and the image URLs, so nothing here reads a file.
 */
import type { Locale, Localized } from './store-releases.ts';

export type PreviewSource = 'app' | 'web';
export type PreviewTheme = 'light' | 'dark';
/** The device a capture was framed for. */
export type PreviewDevice =
  | 'iphone'
  | 'ipad'
  | 'ipad-landscape'
  | 'mac'
  | 'duo-folded'
  | 'duo-unfolded';
/** The device switch; iPad and iPhone Duo each have two variants. */
export type DeviceGroup = 'iphone' | 'ipad' | 'mac' | 'duo';

export type ManifestItem = {
  screen: string;
  device: string;
  theme: string;
  locale: string;
  width: number;
  height: number;
  avif: string;
  webp: string;
};
export type PreviewManifest = { items: readonly ManifestItem[] };

export type PreviewImage = {
  device: PreviewDevice;
  theme: PreviewTheme;
  locale: Locale;
  width: number;
  height: number;
  avif: string;
  webp: string;
};

export type FeatureCopy = {
  /** The product the screen belongs to, as the reader knows it. */
  product: string;
  /** The roadmap track the feature is planned on (`#track-<id>`). */
  track: string;
  title: Localized;
  body: Localized;
};

export type Feature = FeatureCopy & {
  id: string;
  source: PreviewSource;
  images: readonly PreviewImage[];
};

export const DEVICE_GROUPS: Record<DeviceGroup, readonly PreviewDevice[]> = {
  iphone: ['iphone'],
  ipad: ['ipad', 'ipad-landscape'],
  mac: ['mac'],
  duo: ['duo-folded', 'duo-unfolded'],
};
const DEVICES = Object.values(DEVICE_GROUPS).flat();
const GROUP_ORDER = Object.keys(DEVICE_GROUPS) as DeviceGroup[];

const copy = (
  product: string,
  track: string,
  title: Localized,
  body: Localized
): FeatureCopy => ({ product, track, title, body });

/**
 * Public copy per `<source>/<screen>`, in the order the rail shows them. A
 * captured screen without copy here is left out, so a new capture never
 * ships unlabelled.
 */
export const FEATURE_COPY: Readonly<Record<string, FeatureCopy>> = {
  'app/tasks': copy(
    'Tasks',
    'tasks',
    { en: 'Task boards', vi: 'Bảng công việc' },
    {
      en: 'Plan work in Kanban, list or timeline, with priority, estimates and labels on every card.',
      vi: 'Lên kế hoạch theo Kanban, danh sách hoặc dòng thời gian, mỗi thẻ có độ ưu tiên, ước lượng và nhãn.',
    }
  ),
  'app/task-detail': copy(
    'Tasks',
    'tasks',
    { en: 'Task details', vi: 'Chi tiết công việc' },
    {
      en: 'Status, priority, dates and assignees for a task on one screen.',
      vi: 'Trạng thái, độ ưu tiên, ngày và người phụ trách của công việc trên một màn hình.',
    }
  ),
  'web/tasks-board': copy(
    'Tasks',
    'tasks',
    { en: 'Boards on the web', vi: 'Bảng công việc trên web' },
    {
      en: 'The same boards on a bigger screen, with filters, sprints and quick edits.',
      vi: 'Cùng bảng công việc trên màn hình lớn, có bộ lọc, sprint và chỉnh sửa nhanh.',
    }
  ),
  'web/task-detail': copy(
    'Tasks',
    'tasks',
    { en: 'Task details', vi: 'Chi tiết công việc' },
    {
      en: 'Description, assignees, comments and linked resources in one dialog.',
      vi: 'Mô tả, người phụ trách, bình luận và tài nguyên liên kết trong một hộp thoại.',
    }
  ),
  'app/calendar': copy(
    'Calendar',
    'calendar',
    { en: 'Calendar', vi: 'Lịch' },
    {
      en: 'Your events and scheduled tasks side by side, day by day.',
      vi: 'Sự kiện và công việc đã lên lịch nằm cạnh nhau, theo từng ngày.',
    }
  ),
  'web/calendar-week': copy(
    'Calendar',
    'calendar',
    { en: 'Calendar week', vi: 'Lịch theo tuần' },
    {
      en: 'A full week of events, with guests and a Meet link one click away.',
      vi: 'Cả tuần sự kiện, thêm khách mời và liên kết Meet chỉ với một lần nhấn.',
    }
  ),
  'app/assistant': copy(
    'Mira',
    'mira',
    { en: 'Mira chat', vi: 'Trò chuyện với Mira' },
    {
      en: 'Ask Mira about your tasks and plans and get answers from your workspace.',
      vi: 'Hỏi Mira về công việc và kế hoạch, nhận câu trả lời từ không gian làm việc của bạn.',
    }
  ),
  'web/mira-chat': copy(
    'Mira',
    'mira',
    { en: 'Mira on the web', vi: 'Mira trên web' },
    {
      en: 'Chat with Mira in the browser, with the same history as the app.',
      vi: 'Trò chuyện với Mira trên trình duyệt, cùng lịch sử với ứng dụng.',
    }
  ),
  'web/meet-call': copy(
    'Meet',
    'meet',
    { en: 'Meet calls', vi: 'Cuộc gọi Meet' },
    {
      en: 'Video calls with activities, live notes and a calm call bar.',
      vi: 'Cuộc gọi video với hoạt động, ghi chú trực tiếp và thanh điều khiển gọn gàng.',
    }
  ),
  'web/meet-assistant': copy(
    'Meet',
    'meet',
    { en: 'Private assistant in calls', vi: 'Trợ lý riêng trong cuộc gọi' },
    {
      en: 'A private chat beside the call for notes, questions and follow-ups.',
      vi: 'Khung trò chuyện riêng bên cạnh cuộc gọi để ghi chú, hỏi đáp và theo dõi việc cần làm.',
    }
  ),
  'app/dashboard': copy(
    'Tuturuuu',
    'mobile',
    { en: 'Home', vi: 'Trang chủ' },
    {
      en: 'Today, up next and your calendar on one screen.',
      vi: 'Hôm nay, việc tiếp theo và lịch của bạn trên cùng một màn hình.',
    }
  ),
  'app/time-tracker': copy(
    'Time tracker',
    'track',
    { en: 'Time tracker', vi: 'Theo dõi thời gian' },
    {
      en: 'Start a timer from any task and see where the week went.',
      vi: 'Bắt đầu hẹn giờ từ bất kỳ công việc nào và xem tuần của bạn đã trôi qua thế nào.',
    }
  ),
  'app/notes': copy(
    'Notes',
    'tasks',
    { en: 'Notes', vi: 'Ghi chú' },
    {
      en: 'Quick notes next to your tasks, readable offline.',
      vi: 'Ghi chú nhanh bên cạnh công việc, đọc được cả khi ngoại tuyến.',
    }
  ),
  'app/finance': copy(
    'Finance',
    'finance',
    { en: 'Finance', vi: 'Tài chính' },
    {
      en: 'Wallets, transactions and reports in your pocket.',
      vi: 'Ví, giao dịch và báo cáo ngay trong túi bạn.',
    }
  ),
  'web/settings-profile': copy(
    'Account',
    'workspace',
    { en: 'Settings and Profile', vi: 'Cài đặt và Hồ sơ' },
    {
      en: 'One account hub for your profile, appearance, language and security.',
      vi: 'Một nơi cho hồ sơ, giao diện, ngôn ngữ và bảo mật của bạn.',
    }
  ),
  'web/cms-wiki': copy(
    'CMS',
    'cms',
    { en: 'CMS and wiki', vi: 'CMS và wiki' },
    {
      en: 'Write, organise and publish pages with a structured editor.',
      vi: 'Viết, sắp xếp và xuất bản trang với trình soạn thảo có cấu trúc.',
    }
  ),
  'web/upskii': copy(
    'Upskii',
    'upskii',
    { en: 'Upskii lessons', vi: 'Bài học Upskii' },
    {
      en: 'Courses and lessons, linked to your Tuturuuu account.',
      vi: 'Khóa học và bài học, liên kết với tài khoản Tuturuuu của bạn.',
    }
  ),
};

const isTheme = (value: string): value is PreviewTheme =>
  value === 'light' || value === 'dark';
const isLocale = (value: string): value is Locale =>
  value === 'en' || value === 'vi';
const isDevice = (value: string): value is PreviewDevice =>
  (DEVICES as readonly string[]).includes(value);

/**
 * The features to show, in FEATURE_COPY order: every captured screen with
 * public copy and at least one image whose files the build resolved.
 */
export function buildFeatures(
  manifests: Partial<Record<PreviewSource, PreviewManifest>>,
  urls: Readonly<Record<string, string>>,
  resolve: (file: string) => string = (file) => file
): Feature[] {
  const images = new Map<string, PreviewImage[]>();
  for (const source of ['app', 'web'] as const) {
    for (const item of manifests[source]?.items ?? []) {
      const key = `${source}/${item.screen}`;
      const avif = urls[resolve(item.avif)];
      const webp = urls[resolve(item.webp)];
      if (!FEATURE_COPY[key] || !avif || !webp) continue;
      if (!isDevice(item.device) || !isTheme(item.theme)) continue;
      if (!isLocale(item.locale)) continue;
      const list = images.get(key) ?? [];
      list.push({
        device: item.device,
        theme: item.theme,
        locale: item.locale,
        width: item.width,
        height: item.height,
        avif,
        webp,
      });
      images.set(key, list);
    }
  }
  return Object.entries(FEATURE_COPY).flatMap(([key, entry]) => {
    const found = images.get(key);
    if (!found?.length) return [];
    const [source, id = ''] = key.split('/') as [PreviewSource, string];
    return [{ ...entry, id, source, images: found }];
  });
}

/** The device groups a feature has at least one capture for, in order. */
export function deviceGroups(feature: Feature): DeviceGroup[] {
  return GROUP_ORDER.filter((group) =>
    feature.images.some((image) => DEVICE_GROUPS[group].includes(image.device))
  );
}

export type Selection = {
  group: DeviceGroup;
  /** 0 for portrait or folded, 1 for landscape or unfolded. */
  variant: 0 | 1;
  theme: PreviewTheme;
  lang: Locale;
};

/**
 * The image for a selection, so a switch never shows an empty frame. When the
 * feature has no capture on the chosen device group, its first group stands
 * in. Within the group the chosen variant is tried first; for each variant
 * the chosen theme comes before the other one, and for each theme the
 * reader's language comes before the other language.
 */
export function pickImage(feature: Feature, want: Selection) {
  const groups = deviceGroups(feature);
  const group = groups.includes(want.group) ? want.group : groups[0];
  if (!group) return null;
  const [first, second] = DEVICE_GROUPS[group];
  const devices =
    want.variant === 1 && second ? [second, first] : [first, second];
  const themes: PreviewTheme[] =
    want.theme === 'dark' ? ['dark', 'light'] : ['light', 'dark'];
  const langs: Locale[] = want.lang === 'vi' ? ['vi', 'en'] : ['en', 'vi'];
  for (const device of devices) {
    for (const theme of themes) {
      for (const lang of langs) {
        const image = feature.images.find(
          (entry) =>
            entry.device === device &&
            entry.theme === theme &&
            entry.locale === lang
        );
        if (image) return { group, image };
      }
    }
  }
  return null;
}

/** Whether the feature has both of a group's variants (iPad, iPhone Duo). */
export function hasVariants(feature: Feature, group: DeviceGroup) {
  const [first, second] = DEVICE_GROUPS[group];
  if (!second) return false;
  const has = (device: PreviewDevice) =>
    feature.images.some((image) => image.device === device);
  return has(first as PreviewDevice) && has(second);
}
