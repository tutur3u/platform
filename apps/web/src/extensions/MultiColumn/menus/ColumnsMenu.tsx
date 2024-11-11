import { ColumnLayout } from '../Columns';
import { Icon } from '@/components/components/ui/Icon';
import { MenuProps } from '@/components/components/ui/PopoverMenu';
import { Toolbar } from '@/components/components/ui/Toolbar';
import { getRenderContainer } from '@/lib/utils/getRenderContainer';
import { BubbleMenu as BaseBubbleMenu, useEditorState } from '@tiptap/react';
import { useCallback } from 'react';
import { sticky } from 'tippy.js';
import { v4 as uuid } from 'uuid';

export const ColumnsMenu = ({ editor, appendTo }: MenuProps) => {
  // If editor is not defined, return null early to avoid rendering and hook calls
  if (!editor) return null;

  const getReferenceClientRect = useCallback(() => {
    const renderContainer = getRenderContainer(editor, 'columns');
    return renderContainer?.getBoundingClientRect() || new DOMRect(-1000, -1000, 0, 0);
  }, [editor]);

  const shouldShow = useCallback(() => {
    return editor.isActive('columns');
  }, [editor]);

  const onColumnLeft = useCallback(() => {
    editor.chain().focus().setLayout(ColumnLayout.SidebarLeft).run();
  }, [editor]);

  const onColumnRight = useCallback(() => {
    editor.chain().focus().setLayout(ColumnLayout.SidebarRight).run();
  }, [editor]);

  const onColumnTwo = useCallback(() => {
    editor.chain().focus().setLayout(ColumnLayout.TwoColumn).run();
  }, [editor]);

  const { isColumnLeft, isColumnRight, isColumnTwo } = useEditorState({
    editor,
    selector: (ctx) => ({
      isColumnLeft: ctx.editor?.isActive('columns', {
        layout: ColumnLayout.SidebarLeft,
      }) || false,
      isColumnRight: ctx.editor?.isActive('columns', {
        layout: ColumnLayout.SidebarRight,
      }) || false,
      isColumnTwo: ctx.editor?.isActive('columns', {
        layout: ColumnLayout.TwoColumn,
      }) || false,
    }),
  });

  return (
    <BaseBubbleMenu
      editor={editor}
      pluginKey={`columnsMenu-${uuid()}`}
      shouldShow={shouldShow}
      updateDelay={0}
      tippyOptions={{
        offset: [0, 8],
        popperOptions: {
          modifiers: [{ name: 'flip', enabled: false }],
        },
        getReferenceClientRect,
        appendTo: () => appendTo?.current || document.body,
        plugins: [sticky],
        sticky: 'popper',
      }}
    >
      <Toolbar.Wrapper>
        <Toolbar.Button
          tooltip="Sidebar left"
          active={isColumnLeft}
          onClick={onColumnLeft}
        >
          <Icon name="PanelLeft" />
        </Toolbar.Button>
        <Toolbar.Button
          tooltip="Two columns"
          active={isColumnTwo}
          onClick={onColumnTwo}
        >
          <Icon name="Columns2" />
        </Toolbar.Button>
        <Toolbar.Button
          tooltip="Sidebar right"
          active={isColumnRight}
          onClick={onColumnRight}
        >
          <Icon name="PanelRight" />
        </Toolbar.Button>
      </Toolbar.Wrapper>
    </BaseBubbleMenu>
  );
};

export default ColumnsMenu;
