import React, {
  KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';


export interface MentionListRef {
  onKeyDown: (params: { event: ReactKeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: string[]; // Array of items to be displayed
  command: (payload: { id: string }) => void; 
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState<number>(0);

    // Function to select an item based on the index
    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command({ id: item });
      }
    };


    const upHandler = () => {
      setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };


    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    // Handler for Enter key
    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    // Reset selected index when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [props.items]);

   
    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: ReactKeyboardEvent<Element> }) => {
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
