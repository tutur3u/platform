import { MentionSuggestion } from './mentionSuggesionOptions';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type SuggestionListRef = {
  // For convenience using this SuggestionList from within the
  // mentionSuggestionOptions, we'll match the signature of SuggestionOptions's
  // `onKeyDown` returned in its `render` function
  onKeyDown: NonNullable<
    ReturnType<
      NonNullable<SuggestionOptions<MentionSuggestion>['render']>
    >['onKeyDown']
  >;
};

interface MentionNodeAttrs {
  id: string | null;
  label?: string | null;
}

export type SuggestionListProps = SuggestionProps<MentionSuggestion>;

const SuggestionList = forwardRef<SuggestionListRef, SuggestionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      if (index >= props.items.length) {
        // Make sure we actually have enough items to select the given index. For
        // instance, if a user presses "Enter" when there are no options, the index will
        // be 0 but there won't be any items, so just ignore the callback here
        return;
      }

      const suggestion = props.items[index];
      if (!suggestion) {
        return;
      }
      const mentionItem: MentionNodeAttrs = {
        id: suggestion.id,
        label: suggestion.mentionLabel,
      };
      props.command(mentionItem);
    };

    const upHandler = () => {
      setSelectedIndex(
        (selectedIndex + props.items.length - 1) % props.items.length
      );
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }

        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }

        if (event.key === 'Enter') {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    return (
      <div className="relative flex flex-col gap-0.5 overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-md">
        {props.items.length ? (
          props.items.map((item, index) => (
            <button
              className={`flex w-full items-center gap-1 bg-transparent text-left hover:bg-gray-100 ${
                index === selectedIndex ? 'bg-gray-50 hover:bg-gray-100' : ''
              }`}
              key={index}
              onClick={() => selectItem(index)}
            >
              {item.mentionLabel}
            </button>
          ))
        ) : (
          <div className="px-2 py-1 text-sm text-gray-500">No result</div>
        )}
      </div>
    );
  }
);

export default SuggestionList;
