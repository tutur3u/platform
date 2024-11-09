import SuggestionList, { SuggestionListRef } from './SuggestionList';
import type { MentionOptions } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';

export type MentionSuggestion = {
  id: string;
  mentionLabel: string;
};

const DOM_RECT_FALLBACK: DOMRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON() {
    return {};
  },
};

export const mentionSuggestionOptions: MentionOptions['suggestion'] = {
  // Replace this `items` code with a call to your API that returns suggestions
  // of whatever sort you like (including potentially additional data beyond
  // just an ID and a label). It need not be async but is written that way for
  // the sake of example.
  items: async ({ query }): Promise<MentionSuggestion[]> =>
    Promise.resolve(
      [
        'Lea Thompson',
        'Cyndi Lauper',
        'Tom Cruise',
        'Madonna',
        'Jerry Hall',
        'Joan Collins',
        'Winona Ryder',
        'Christina Applegate',
        'Alyssa Milano',
        'Molly Ringwald',
        'Ally Sheedy',
        'Debbie Harry',
        'Olivia Newton-John',
        'Elton John',
        'Michael J. Fox',
        'Axl Rose',
        'Emilio Estevez',
        'Ralph Macchio',
        'Rob Lowe',
        'Jennifer Grey',
        'Mickey Rourke',
        'John Cusack',
        'Matthew Broderick',
        'Justine Bateman',
        'Lisa Bonet',
        'Benicio Monserrate Rafael del Toro Sánchez',
      ]
        // Typically we'd be getting this data from an API where we'd have a
        // definitive "id" to use for each suggestion item, but for the sake of
        // example, we'll just set the index within this hardcoded list as the
        // ID of each item.
        .map((name, index) => ({ mentionLabel: name, id: index.toString() }))
        // Find matching entries based on what the user has typed so far (after
        // the @ symbol)
        .filter((item) =>
          item.mentionLabel.toLowerCase().startsWith(query.toLowerCase())
        )
        .slice(0, 5)
    ),

  render: () => {
    let component: ReactRenderer<SuggestionListRef> | undefined;
    let popup: TippyInstance | undefined;

    return {
      onStart: (props) => {
        component = new ReactRenderer(SuggestionList, {
          props,
          editor: props.editor,
        });

        popup = tippy('body', {
          getReferenceClientRect: () =>
            props.clientRect?.() ?? DOM_RECT_FALLBACK,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })[0];
      },

      onUpdate(props) {
        component?.updateProps(props);

        popup?.setProps({
          getReferenceClientRect: () =>
            props.clientRect?.() ?? DOM_RECT_FALLBACK,
        });
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup?.hide();
          return true;
        }

        if (!component?.ref) {
          return false;
        }

        return component.ref.onKeyDown(props);
      },

      onExit() {
        popup?.destroy();
        component?.destroy();
        popup = undefined;
        component = undefined;
      },
    };
  },
};
