import React, {
  KeyboardEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

interface MentionListProps {
  items: string[];
  command: (payload: { id: string }) => void;
}

export interface MentionListRef {
  onKeyDown: (params: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState<number>(0);

    const selectItem = (index: number) => {
      const item = props.items[index];

      if (item) {
        props.command({ id: item });
      }
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

    useEffect(() => {
      setSelectedIndex(0);
    }, [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
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
      <div className="relative flex flex-col gap-1 overflow-auto rounded-lg border border-gray-300 bg-white p-2.5 shadow-md">
        {props.items.length ? (
          props.items.map((item, index) => (
            <button
              className={`flex w-full items-center gap-1.5 text-left ${index === selectedIndex ? 'bg-gray-200' : ''} hover:bg-gray-100`}
              key={index}
              onClick={() => selectItem(index)}
            >
              {item}
            </button>
          ))
        ) : (
          <div className="p-2 text-gray-500">No result</div>
        )}
      </div>
    );
  }
);

export default MentionList;
