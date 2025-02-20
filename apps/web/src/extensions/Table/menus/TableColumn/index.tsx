import { ShouldShowProps } from './type';
import { isColumnGripSelected } from './utils';
import { Icon } from '@/components/components/ui/Icon';
import * as PopoverMenu from '@/components/components/ui/PopoverMenu';
import { MenuProps } from '@/components/components/ui/PopoverMenu';
import { Toolbar } from '@/components/components/ui/Toolbar';
import { BubbleMenu as BaseBubbleMenu } from '@tiptap/react';
import React, { useCallback } from 'react';

export const TableColumnMenu = React.memo(
  ({ editor, appendTo }: MenuProps): React.ReactNode | null => {
    // Return null if editor is undefined
    if (!editor) return null;

    const shouldShow = useCallback(
      ({ view, state, from }: ShouldShowProps) => {
        if (!state) return false;
        return isColumnGripSelected({ editor, view, state, from: from || 0 });
      },
      [editor]
    );

    const onAddColumnBefore = useCallback(() => {
      editor?.chain().focus().addColumnBefore().run();
    }, [editor]);

    const onAddColumnAfter = useCallback(() => {
      editor?.chain().focus().addColumnAfter().run();
    }, [editor]);

    const onDeleteColumn = useCallback(() => {
      editor?.chain().focus().deleteColumn().run();
    }, [editor]);

    return (
      <BaseBubbleMenu
        editor={editor}
        pluginKey="tableColumnMenu"
        updateDelay={0}
        tippyOptions={{
          appendTo: () => appendTo?.current ?? document.body, // Fallback to `document.body` if `appendTo.current` is undefined
          offset: [0, 15],
          popperOptions: {
            modifiers: [{ name: 'flip', enabled: false }],
          },
        }}
        shouldShow={shouldShow}
      >
        <Toolbar.Wrapper isVertical>
          <PopoverMenu.Item
            iconComponent={<Icon name="ArrowLeftToLine" />}
            close={false}
            label="Add column before"
            onClick={onAddColumnBefore}
          />
          <PopoverMenu.Item
            iconComponent={<Icon name="ArrowRightToLine" />}
            close={false}
            label="Add column after"
            onClick={onAddColumnAfter}
          />
          <PopoverMenu.Item
            icon="Trash"
            close={false}
            label="Delete column"
            onClick={onDeleteColumn}
          />
        </Toolbar.Wrapper>
      </BaseBubbleMenu>
    );
  }
);

TableColumnMenu.displayName = 'TableColumnMenu';

export default TableColumnMenu;
