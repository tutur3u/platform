import { cleanText, hasRoom, SHOWCASE_LIMITS } from './limits';

export const MAIL_FOLDERS = ['inbox', 'sent', 'archive'] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export const MAIL_FOLDER_LABELS: Record<MailFolder, string> = {
  inbox: 'Inbox',
  sent: 'Sent',
  archive: 'Archive',
};

export type DemoMessage = {
  id: number;
  folder: MailFolder;
  /** Sender for received mail, recipient for sent mail. */
  correspondent: string;
  subject: string;
  body: string;
  read: boolean;
};

export type MailState = {
  messages: DemoMessage[];
  folder: MailFolder;
  selectedId: number | null;
  nextId: number;
};

export type MailAction =
  | { type: 'open-folder'; folder: MailFolder }
  | { type: 'select'; id: number }
  | { type: 'archive'; id: number }
  | { type: 'restore'; id: number }
  | { type: 'send'; to: string; subject: string; body: string }
  | { type: 'reset' };

export const initialMailState: MailState = {
  messages: [
    {
      id: 1,
      folder: 'inbox',
      correspondent: 'Linh from Design',
      subject: 'Updated onboarding screens',
      body: 'The new onboarding screens are ready for review. Comments welcome before Thursday.',
      read: false,
    },
    {
      id: 2,
      folder: 'inbox',
      correspondent: 'Billing',
      subject: 'Your monthly summary',
      body: 'Your workspace summary for this month is ready. No action needed.',
      read: false,
    },
    {
      id: 3,
      folder: 'inbox',
      correspondent: 'Minh',
      subject: 'Lunch on Friday?',
      body: 'A few of us are trying the new place downstairs. Join us?',
      read: true,
    },
  ],
  folder: 'inbox',
  selectedId: 1,
  nextId: 4,
};

export function messagesIn(
  messages: readonly DemoMessage[],
  folder: MailFolder
): DemoMessage[] {
  return messages.filter((message) => message.folder === folder);
}

export function unreadCount(messages: readonly DemoMessage[]): number {
  return messages.filter((m) => m.folder === 'inbox' && !m.read).length;
}

function firstIdIn(messages: readonly DemoMessage[], folder: MailFolder) {
  return messagesIn(messages, folder)[0]?.id ?? null;
}

function moveMessage(
  state: MailState,
  id: number,
  from: MailFolder,
  to: MailFolder
): MailState {
  const target = state.messages.find((message) => message.id === id);
  if (!target || target.folder !== from) return state;
  const messages = state.messages.map((message) =>
    message.id === id ? { ...message, folder: to } : message
  );
  return {
    ...state,
    messages,
    selectedId:
      state.selectedId === id
        ? firstIdIn(messages, state.folder)
        : state.selectedId,
  };
}

export function mailReducer(state: MailState, action: MailAction): MailState {
  switch (action.type) {
    case 'open-folder':
      return {
        ...state,
        folder: action.folder,
        selectedId: firstIdIn(state.messages, action.folder),
      };
    case 'select':
      return {
        ...state,
        selectedId: action.id,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, read: true } : message
        ),
      };
    case 'archive':
      return moveMessage(state, action.id, 'inbox', 'archive');
    case 'restore':
      return moveMessage(state, action.id, 'archive', 'inbox');
    case 'send': {
      const to = cleanText(action.to, SHOWCASE_LIMITS.addressLength);
      const subject = cleanText(action.subject, SHOWCASE_LIMITS.titleLength);
      const body = cleanText(action.body, SHOWCASE_LIMITS.bodyLength);
      if (
        !to ||
        !subject ||
        !hasRoom(state.messages, SHOWCASE_LIMITS.listItems)
      )
        return state;
      return {
        messages: [
          {
            id: state.nextId,
            folder: 'sent',
            correspondent: to,
            subject,
            body,
            read: true,
          },
          ...state.messages,
        ],
        folder: 'sent',
        selectedId: state.nextId,
        nextId: state.nextId + 1,
      };
    }
    case 'reset':
      return initialMailState;
  }
}
