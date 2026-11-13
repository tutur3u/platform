export type StatusPageLocale = 'en' | 'vi';
export type StatusPageVariant = 'not-found' | 'error';

interface VariantCopy {
  code: string;
  title: string;
  description: string;
  documentTitle: string;
}

export interface StatusPageCopy {
  'not-found': VariantCopy;
  error: VariantCopy;
  retry: string;
  back: string;
  openApp: string;
  appHome: string;
  home: string;
  search: string;
  help: string;
  nav: string;
  reference: string;
  details: string;
  privacy: string;
  terms: string;
}

export const STATUS_PAGE_COPY: Record<StatusPageLocale, StatusPageCopy> = {
  en: {
    'not-found': {
      code: '404',
      title: 'We couldn’t find that page',
      description:
        'The link may be broken or the page may have moved. Check the address, or pick a place to go next.',
      documentTitle: 'Page not found · Tuturuuu',
    },
    error: {
      code: '500',
      title: 'Something went wrong',
      description:
        'Your work is safe. Try again, or head back to a page that works.',
      documentTitle: 'Something went wrong · Tuturuuu',
    },
    retry: 'Try again',
    back: 'Go back',
    openApp: 'Open {app}',
    appHome: 'App home',
    home: 'Tuturuuu home',
    search: 'Search',
    help: 'Help',
    nav: 'Helpful links',
    reference: 'Error reference',
    details: 'Developer details',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  vi: {
    'not-found': {
      code: '404',
      title: 'Không tìm thấy trang này',
      description:
        'Liên kết có thể đã hỏng hoặc trang đã được chuyển đi. Hãy kiểm tra lại địa chỉ hoặc chọn nơi bạn muốn đến tiếp.',
      documentTitle: 'Không tìm thấy trang · Tuturuuu',
    },
    error: {
      code: '500',
      title: 'Đã có lỗi xảy ra',
      description:
        'Dữ liệu của bạn vẫn an toàn. Hãy thử lại hoặc quay về một trang đang hoạt động.',
      documentTitle: 'Đã có lỗi xảy ra · Tuturuuu',
    },
    retry: 'Thử lại',
    back: 'Quay lại',
    openApp: 'Mở {app}',
    appHome: 'Trang ứng dụng',
    home: 'Trang chủ Tuturuuu',
    search: 'Tìm kiếm',
    help: 'Trợ giúp',
    nav: 'Liên kết hữu ích',
    reference: 'Mã tham chiếu lỗi',
    details: 'Chi tiết cho nhà phát triển',
    privacy: 'Quyền riêng tư',
    terms: 'Điều khoản',
  },
};

/**
 * Resolves the page language from a locale tag (`vi`, `vi-VN`), a document
 * `lang`, or a URL path whose first segment is the locale (`/vi/...`, and the
 * roadmap's `/roadmap/vi/...`). Anything else is English.
 */
export function resolveStatusPageLocale(
  ...inputs: readonly (string | null | undefined)[]
): StatusPageLocale {
  for (const input of inputs) {
    if (!input) continue;
    const value = input.trim().toLowerCase();
    if (value.startsWith('/')) {
      const segments = value.split(/[?#]/u)[0]?.split('/').filter(Boolean);
      const first = segments?.[0] === 'roadmap' ? segments[1] : segments?.[0];
      if (first === 'vi') return 'vi';
      if (first === 'en') return 'en';
      continue;
    }
    if (value === 'vi' || value.startsWith('vi-')) return 'vi';
    if (value === 'en' || value.startsWith('en-')) return 'en';
  }
  return 'en';
}
