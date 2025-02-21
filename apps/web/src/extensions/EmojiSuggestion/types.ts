import { EmojiItem } from '@tiptap-pro/extension-emoji';

export interface Command {
  name: string;
}

export interface EmojiListProps {
  // eslint-disable-next-line no-unused-vars
  command: (command: Command) => void;
  items: EmojiItem[];
}
