import { ImageBlockWidth } from './ImageBlockWidth';
import { Icon } from '@/components/components/ui/Icon';
import { MenuProps } from '@/components/components/ui/PopoverMenu';
import { Toolbar } from '@/components/components/ui/Toolbar';
import { getRenderContainer } from '@/lib/utils/index';
import {
  BubbleMenu as BaseBubbleMenu,
  Editor,
  useEditorState,
} from '@tiptap/react';
import React, { useCallback, useRef } from 'react';
import { Instance, sticky } from 'tippy.js';
import { v4 as uuid } from 'uuid';

interface ImageBlockMenuProps extends MenuProps {
  editor: Editor | undefined;
}

export const ImageBlockMenu = ({
  editor,
  appendTo,
}: ImageBlockMenuProps): JSX.Element | null => {
  const menuRef = useRef<HTMLDivElement>(null);
  const tippyInstance = useRef<Instance | null>(null);

  if (!editor) {
    return null;
  }

  const getReferenceClientRect = useCallback(() => {
    const renderContainer = getRenderContainer(editor, 'node-imageBlock');
    const rect =
      renderContainer?.getBoundingClientRect() ||
      new DOMRect(-1000, -1000, 0, 0);
    return rect;
  }, [editor]);

  const shouldShow = useCallback(() => {
    return editor.isActive('imageBlock');
  }, [editor]);

  const onAlignImageLeft = useCallback(() => {
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .setImageBlockAlign('left')
      .run();
  }, [editor]);

  const onAlignImageCenter = useCallback(() => {
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .setImageBlockAlign('center')
      .run();
  }, [editor]);

  const onAlignImageRight = useCallback(() => {
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .setImageBlockAlign('right')
      .run();
  }, [editor]);

  const onWidthChange = useCallback(
    (value: number) => {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .setImageBlockWidth(value)
        .run();
    },
    [editor]
  );

  const { isImageCenter, isImageLeft, isImageRight, width } = useEditorState({
    editor,
    selector: (ctx) => {
      return {
        isImageLeft: ctx.editor.isActive('imageBlock', { align: 'left' }),
        isImageCenter: ctx.editor.isActive('imageBlock', { align: 'center' }),
        isImageRight: ctx.editor.isActive('imageBlock', { align: 'right' }),
        width: parseInt(ctx.editor.getAttributes('imageBlock')?.width || '0'),
      };
    },
  });

  const getAppendTo = useCallback(() => {
    if (appendTo && appendTo.current) {
      return appendTo.current;
    }
    return document.body; // Fallback to body if appendTo is not set
  }, [appendTo]);

  return (
    <BaseBubbleMenu
      editor={editor}
      pluginKey={`imageBlockMenu-${uuid()}`}
      shouldShow={shouldShow}
      updateDelay={0}
      tippyOptions={{
        offset: [0, 8],
        popperOptions: {
          modifiers: [{ name: 'flip', enabled: false }],
        },
        getReferenceClientRect,
        onCreate: (instance: Instance) => {
          tippyInstance.current = instance;
        },
        appendTo: getAppendTo,
        plugins: [sticky],
        sticky: 'popper',
      }}
    >
      <Toolbar.Wrapper shouldShowContent={shouldShow()} ref={menuRef}>
        <Toolbar.Button
          tooltip="Align image left"
          active={isImageLeft}
          onClick={onAlignImageLeft}
        >
          <Icon name="AlignHorizontalDistributeStart" />
        </Toolbar.Button>
        <Toolbar.Button
          tooltip="Align image center"
          active={isImageCenter}
          onClick={onAlignImageCenter}
        >
          <Icon name="AlignHorizontalDistributeCenter" />
        </Toolbar.Button>
        <Toolbar.Button
          tooltip="Align image right"
          active={isImageRight}
          onClick={onAlignImageRight}
        >
          <Icon name="AlignHorizontalDistributeEnd" />
        </Toolbar.Button>
        <Toolbar.Divider />
        <ImageBlockWidth onChange={onWidthChange} value={width} />
      </Toolbar.Wrapper>
    </BaseBubbleMenu>
  );
};

export default ImageBlockMenu;
