import SuggestionList, { SuggestionListRef } from './SuggestionList';
import { createClient } from '@/utils/supabase/client';
import type { MentionOptions } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import { useSearchParams } from 'next/navigation';
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
  items: async ({ query }): Promise<MentionSuggestion[]> => {
    const searchParams = useSearchParams();
    const wsId = searchParams.get('wsId') as string;

    const supabase = await createClient();

    const queryBuilder = supabase
      .from('workspace_users')
      .select('*')
      .eq('ws_id', wsId);

    if (query) {
      queryBuilder.ilike('display_name', `%${query}%`);
    }

    queryBuilder.order('id');

    const { data, error } = await queryBuilder;
    if (error) throw error;

    return (data || [])
      .map((user) => ({
        id: user.id.toString(),
        mentionLabel: user.display_name ?? '',
      }))
      .slice(0, 5); // Limit to 5 suggestions
  },

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
