import { Command, MenuListProps } from './types';
import { DropdownButton } from '@/components/components/ui/Dropdown';
import { Icon } from '@/components/components/ui/Icon';
import { Surface } from '@/components/components/ui/Surface';
import React, { useCallback, useEffect, useRef, useState } from 'react';

export const MenuList = React.forwardRef((props: MenuListProps, ref) => {
  const scrollContainer = useRef<HTMLDivElement>(null);
  const activeItem = useRef<HTMLButtonElement>(null);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Reset selection indices when items change
  useEffect(() => {
    setSelectedGroupIndex(0);
    setSelectedCommandIndex(0);
  }, [props.items]);

  const selectItem = useCallback(
    (groupIndex: number, commandIndex: number) => {
      const command = props.items?.[groupIndex]?.commands?.[commandIndex];
      if (command) {
        props.command(command);
      }
    },
    [props]
  );

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: React.KeyboardEvent }) => {
      if (!props.items?.length) return false;

      if (event.key === 'ArrowDown') {
        const commands = props.items?.[selectedGroupIndex]?.commands || [];

        let newCommandIndex = selectedCommandIndex + 1;
        let newGroupIndex = selectedGroupIndex;

        if (newCommandIndex >= commands.length) {
          newCommandIndex = 0;
          newGroupIndex = (selectedGroupIndex + 1) % (props.items?.length || 1);
        }

        setSelectedCommandIndex(newCommandIndex);
        setSelectedGroupIndex(newGroupIndex);

        return true;
      }

      if (event.key === 'ArrowUp') {
        let newCommandIndex = selectedCommandIndex - 1;
        let newGroupIndex = selectedGroupIndex;

        if (newCommandIndex < 0) {
          newGroupIndex = selectedGroupIndex - 1;
          if (newGroupIndex < 0) {
            newGroupIndex = (props.items?.length || 1) - 1;
          }

          const newGroupCommands = props.items?.[newGroupIndex]?.commands;
          newCommandIndex =
            newGroupCommands && newGroupCommands.length
              ? newGroupCommands.length - 1
              : 0;
        }

        setSelectedCommandIndex(newCommandIndex);
        setSelectedGroupIndex(newGroupIndex);

        return true;
      }

      if (event.key === 'Enter') {
        if (
          props.items?.length &&
          selectedGroupIndex !== -1 &&
          selectedCommandIndex !== -1
        ) {
          selectItem(selectedGroupIndex, selectedCommandIndex);
          return true;
        }
      }

      return false;
    },
  }));

  useEffect(() => {
    if (activeItem.current && scrollContainer.current) {
      const offsetTop = activeItem.current.offsetTop;
      const offsetHeight = activeItem.current.offsetHeight;

      scrollContainer.current.scrollTop = offsetTop - offsetHeight;
    }
  }, [selectedCommandIndex, selectedGroupIndex]);

  const createCommandClickHandler = useCallback(
    (groupIndex: number, commandIndex: number) => {
      return () => {
        selectItem(groupIndex, commandIndex);
      };
    },
    [selectItem]
  );

  if (!props.items?.length) {
    return null;
  }

  return (
    <Surface
      ref={scrollContainer}
      className="mb-8 max-h-[min(80vh,24rem)] flex-wrap overflow-auto p-2 text-black"
    >
      <div className="grid grid-cols-1 gap-0.5">
        {props.items.map((group, groupIndex) => (
          <React.Fragment key={`${group.title}-wrapper`}>
            <div
              className="col-[1/-1] mx-2 mt-4 select-none text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500 first:mt-0.5"
              key={`${group.title}`}
            >
              {group.title}
            </div>
            {group.commands.map((command: Command, commandIndex) => (
              <DropdownButton
                key={`${command.label}`}
                ref={
                  selectedGroupIndex === groupIndex &&
                  selectedCommandIndex === commandIndex
                    ? activeItem
                    : null
                }
                isActive={
                  selectedGroupIndex === groupIndex &&
                  selectedCommandIndex === commandIndex
                }
                onClick={createCommandClickHandler(groupIndex, commandIndex)}
              >
                <Icon name={command.iconName} className="mr-1" />
                {command.label}
              </DropdownButton>
            ))}
          </React.Fragment>
        ))}
      </div>
    </Surface>
  );
});

MenuList.displayName = 'MenuList';

export default MenuList;
