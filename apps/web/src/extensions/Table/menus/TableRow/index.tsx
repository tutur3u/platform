import { ShouldShowProps } from '../TableColumn/type';
import { isRowGripSelected } from './utils';
import { Icon } from '@/components/components/ui/Icon';
import { MenuProps } from '@/components/components/ui/PopoverMenu';
import * as PopoverMenu from '@/components/components/ui/PopoverMenu';
import { Toolbar } from '@/components/components/ui/Toolbar';
import { BubbleMenu as BaseBubbleMenu } from '@tiptap/react';
import React, { useCallback } from 'react';

export const TableRowMenu = React.memo(
  ({ editor, appendTo }: MenuProps): JSX.Element | null => {
    // Guard clause to return null if editor is undefined
    if (!editor) {
      return null;
    }

    const shouldShow = useCallback(
      ({ view, state, from }: ShouldShowProps) => {
        if (!state || !from) {
          return false;
        }

        return isRowGripSelected({ editor, view, state, from });
      },
      [editor]
    );

    const onAddRowBefore = useCallback(() => {
      editor.chain().focus().addRowBefore().run();
    }, [editor]);

    const onAddRowAfter = useCallback(() => {
      editor.chain().focus().addRowAfter().run();
    }, [editor]);

    const onDeleteRow = useCallback(() => {
      editor.chain().focus().deleteRow().run();
    }, [editor]);

    return (
      <BaseBubbleMenu
        editor={editor}
        pluginKey="tableRowMenu"
        updateDelay={0}
        tippyOptions={{
          appendTo: () => appendTo?.current ?? document.body, // Fallback to document.body if appendTo.current is undefined
          placement: 'left',
          offset: [0, 15],
          popperOptions: {
            modifiers: [{ name: 'flip', enabled: false }],
          },
        }}
        shouldShow={shouldShow}
      >
        <Toolbar.Wrapper isVertical>
          <PopoverMenu.Item
            iconComponent={<Icon name="ArrowUpToLine" />}
            close={false}
            label="Add row before"
            onClick={onAddRowBefore}
          />
          <PopoverMenu.Item
            iconComponent={<Icon name="ArrowDownToLine" />}
            close={false}
            label="Add row after"
            onClick={onAddRowAfter}
          />
          <PopoverMenu.Item
            icon="Trash"
            close={false}
            label="Delete row"
            onClick={onDeleteRow}
          />
        </Toolbar.Wrapper>
      </BaseBubbleMenu>
    );
  }
);

TableRowMenu.displayName = 'TableRowMenu';

export default TableRowMenu;
