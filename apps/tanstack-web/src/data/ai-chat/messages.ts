import {
  defaultLocale,
  isSupportedLocale,
  type Locale,
} from '../../lib/platform/locale';

const messages = {
  en: {
    myChatbotsDescription:
      'Manage your custom chatbots with your own prompts and responses.',
    newChatbot: 'New chatbot',
  },
  vi: {
    myChatbotsDescription:
      'Quản lý chatbot tùy chỉnh của bạn với các lệnh nhắc và câu trả lời của riêng bạn.',
    newChatbot: 'Chatbot mới',
  },
} as const satisfies Record<
  Locale,
  {
    myChatbotsDescription: string;
    newChatbot: string;
  }
>;

export function getAiChatMessages(locale: string | undefined) {
  return messages[isSupportedLocale(locale) ? locale : defaultLocale];
}
