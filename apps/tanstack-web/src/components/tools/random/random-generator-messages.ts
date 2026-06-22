import { defaultLocale, isSupportedLocale } from '../../../lib/platform/locale';

export const randomGeneratorMessages = {
  en: {
    actions: {
      copied: 'Copied {label}',
      copy: 'Copy',
      copy_all: 'Copy all',
      regenerate: 'Regenerate',
    },
    description:
      'Create UUIDs, NanoID-style IDs, tokens, API-key-style values, and passwords with Web Crypto. Values stay in your browser.',
    errors: {
      clipboard_failed: 'Could not copy to the clipboard.',
      no_secure_crypto:
        'Secure random generation is unavailable in this browser.',
      select_password_class: 'Select at least one password character set.',
    },
    eyebrow: 'Browser-local Web Crypto',
    fields: {
      batch_count: 'Batch count',
      byte_length: 'Byte length',
      character_sets: 'Character sets',
      exclude_ambiguous: 'Exclude ambiguous characters',
      id_format: 'ID format',
      length: 'Length',
      lowercase: 'Lowercase',
      numbers: 'Numbers',
      password_length: 'Password length',
      prefix: 'Prefix',
      symbols: 'Symbols',
      token_format: 'Token format',
      uppercase: 'Uppercase',
    },
    formats: {
      api_key: 'API-key style',
      base64url: 'Base64url token',
      hex: 'Hex token',
      nanoid: 'NanoID-style ID',
      uuid: 'UUID v4',
    },
    helpers: {
      exclude_ambiguous:
        'Avoid characters such as 0, O, 1, I, l, quotes, and pipes.',
    },
    kinds: {
      id: 'ID',
      password: 'Password',
      token: 'Token',
      uuid: 'UUID',
    },
    meta: {
      description:
        'Generate secure random IDs, tokens, API-key-style values, and passwords locally in your browser.',
      title: 'Secure Random Generator',
    },
    outputs: {
      copy_value: 'Copy value {index}',
      description: 'Each value is freshly generated from Web Crypto.',
      empty: 'No values generated yet.',
      entropy_bits: '{bits} bits',
      generated_value: 'Generated value {index}',
      title: 'Generated values',
    },
    privacy_note:
      'Generated values never leave this page unless you copy them somewhere else.',
    tabs: {
      ids: 'IDs',
      passwords: 'Passwords',
      tokens: 'Tokens',
    },
    title: 'Secure random generator',
  },
  vi: {
    actions: {
      copied: 'Đã sao chép {label}',
      copy: 'Sao chép',
      copy_all: 'Sao chép tất cả',
      regenerate: 'Tạo lại',
    },
    description:
      'Tạo UUID, ID kiểu NanoID, token, giá trị kiểu khóa API và mật khẩu bằng Web Crypto. Các giá trị chỉ ở trong trình duyệt của bạn.',
    errors: {
      clipboard_failed: 'Không thể sao chép vào clipboard.',
      no_secure_crypto: 'Trình duyệt này không hỗ trợ tạo ngẫu nhiên bảo mật.',
      select_password_class: 'Chọn ít nhất một nhóm ký tự cho mật khẩu.',
    },
    eyebrow: 'Web Crypto trong trình duyệt',
    fields: {
      batch_count: 'Số lượng',
      byte_length: 'Số byte',
      character_sets: 'Nhóm ký tự',
      exclude_ambiguous: 'Loại ký tự dễ nhầm',
      id_format: 'Định dạng ID',
      length: 'Độ dài',
      lowercase: 'Chữ thường',
      numbers: 'Chữ số',
      password_length: 'Độ dài mật khẩu',
      prefix: 'Tiền tố',
      symbols: 'Ký hiệu',
      token_format: 'Định dạng token',
      uppercase: 'Chữ hoa',
    },
    formats: {
      api_key: 'Kiểu khóa API',
      base64url: 'Token base64url',
      hex: 'Token hex',
      nanoid: 'ID kiểu NanoID',
      uuid: 'UUID v4',
    },
    helpers: {
      exclude_ambiguous:
        'Tránh các ký tự như 0, O, 1, I, l, dấu nháy và dấu gạch đứng.',
    },
    kinds: {
      id: 'ID',
      password: 'Mật khẩu',
      token: 'Token',
      uuid: 'UUID',
    },
    meta: {
      description:
        'Tạo ID, token, giá trị kiểu khóa API và mật khẩu bảo mật ngay trong trình duyệt.',
      title: 'Trình tạo ngẫu nhiên bảo mật',
    },
    outputs: {
      copy_value: 'Sao chép giá trị {index}',
      description: 'Mỗi giá trị được tạo mới từ Web Crypto.',
      empty: 'Chưa có giá trị nào.',
      entropy_bits: '{bits} bit',
      generated_value: 'Giá trị đã tạo {index}',
      title: 'Giá trị đã tạo',
    },
    privacy_note:
      'Các giá trị đã tạo không rời khỏi trang này trừ khi bạn sao chép chúng sang nơi khác.',
    tabs: {
      ids: 'ID',
      passwords: 'Mật khẩu',
      tokens: 'Token',
    },
    title: 'Trình tạo ngẫu nhiên bảo mật',
  },
} as const;

export type RandomGeneratorMessages =
  (typeof randomGeneratorMessages)[keyof typeof randomGeneratorMessages];

type TranslationValues = Record<string, number | string>;

export function getRandomGeneratorMessages(locale: unknown) {
  return randomGeneratorMessages[
    isSupportedLocale(locale) ? locale : defaultLocale
  ];
}

export function createRandomGeneratorTranslator(
  messages: RandomGeneratorMessages
) {
  return (key: string, values?: TranslationValues) =>
    formatMessage(getMessageTemplate(messages, key), values);
}

function getMessageTemplate(messages: RandomGeneratorMessages, key: string) {
  let current: unknown = messages;

  for (const segment of key.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return key;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : key;
}

function formatMessage(template: string, values?: TranslationValues) {
  let output = template;

  for (const [name, value] of Object.entries(values ?? {})) {
    output = output.replaceAll(`{${name}}`, String(value));
  }

  return output;
}
