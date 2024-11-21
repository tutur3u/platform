import EmojiList from './components/EmojiList';
import { EmojiListProps } from './types';
import { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { RefAttributes } from 'react';
import tippy, { Instance } from 'tippy.js';

export const emojiSuggestion = {
  items: ({ editor, query }: { editor: Editor; query: string }) =>
    editor.storage.emoji.emojis
      .filter(
        ({ shortcodes, tags }: { shortcodes: string[]; tags: string[] }) =>
          shortcodes.find((shortcode) =>
            shortcode.startsWith(query.toLowerCase())
          ) || tags.find((tag) => tag.startsWith(query.toLowerCase()))
      )
      .slice(0, 250),

  allowSpaces: false,

  render: () => {
    let component: ReactRenderer<
      { onKeyDown: (evt: SuggestionKeyDownProps) => boolean },
      EmojiListProps &
        RefAttributes<{ onKeyDown: (evt: SuggestionKeyDownProps) => boolean }>
    >;
    let popup: Instance[] | undefined;

    return {
      onStart: (props: SuggestionProps<any>) => {
        component = new ReactRenderer(EmojiList, {
          props,
          editor: props.editor,
        });

        // tippy returns an array of instances
        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: SuggestionProps<any>) {
        component.updateProps(props);

        // Ensure popup is not undefined and has elements
        if (popup && popup.length > 0) {
          popup[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        }
      },

      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === 'Escape') {
          // Ensure popup is not undefined and has elements
          if (popup && popup.length > 0) {
            popup[0]?.hide();
            component.destroy();
          }
          return true;
        }

        return component.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        // Ensure popup is not undefined and has elements
        if (popup && popup.length > 0) {
          popup[0]?.destroy();
        }
        component.destroy();
      },
    };
  },
};

export default emojiSuggestion;
