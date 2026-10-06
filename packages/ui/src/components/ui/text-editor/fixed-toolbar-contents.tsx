import type { Editor } from '@tiptap/react';
import {
  CirclePlus,
  FileVideo,
  ImageIcon,
  Loader2,
  Settings2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import type { ReactNode } from 'react';
import { TextEditorColorControls } from './color-controls';
import { type EditorCopyLabels, EditorCopyMenu } from './copy-menu';
import { TOOLBAR_GROUPS } from './toolbar-config';
import { ToolbarButton, ToolbarSeparator } from './toolbar-controls';

interface Props {
  editor: Editor;
  options: Map<
    string,
    { onClick: () => void; pressed: boolean; icon: ReactNode }
  >;
  toolsLabel?: string;
  toggleBlockLabel?: string;
  copyLabels?: EditorCopyLabels;
  imageUpload: boolean;
  videoUpload: boolean;
  uploadingImage: boolean;
  uploadingVideo: boolean;
  onImage: () => void;
  onVideo: () => void;
  onConvertToTask?: () => void | Promise<void>;
}

/** Optional compact presentation; existing editors keep the full toolbar. */
export function FixedToolbarContents({
  editor,
  options,
  toolsLabel,
  toggleBlockLabel,
  copyLabels,
  imageUpload,
  videoUpload,
  uploadingImage,
  uploadingVideo,
  onImage,
  onVideo,
  onConvertToTask,
}: Props) {
  function control(key: string) {
    const option = options.get(key);
    if (!option) return null;
    return (
      <ToolbarButton
        key={key}
        id={key}
        label={key === 'toggle-block' ? toggleBlockLabel : undefined}
        icon={option.icon}
        pressed={option.pressed}
        onClick={option.onClick}
      />
    );
  }
  const primary = new Set(['bold', 'italic', 'strike']);
  const groups = TOOLBAR_GROUPS.map((group, index) => {
    const keys = toolsLabel ? group.filter((key) => !primary.has(key)) : group;
    if (!keys.length) return null;
    return (
      <div
        key={index}
        className={toolsLabel ? 'flex items-center gap-1' : 'contents'}
      >
        {!toolsLabel && index > 0 && <ToolbarSeparator />}
        {keys.map(control)}
      </div>
    );
  });
  const secondary = (
    <>
      {groups}
      <ToolbarSeparator />
      <TextEditorColorControls editor={editor} />
      {imageUpload && (
        <>
          <ToolbarSeparator />
          <ToolbarButton
            id="image"
            icon={
              uploadingImage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageIcon className="size-4" />
              )
            }
            pressed={false}
            onClick={onImage}
            disabled={uploadingImage}
          />
          {videoUpload && (
            <ToolbarButton
              id="video"
              icon={
                uploadingVideo ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileVideo className="size-4" />
                )
              }
              pressed={false}
              onClick={onVideo}
              disabled={uploadingVideo}
            />
          )}
        </>
      )}
      {onConvertToTask && (
        <>
          <ToolbarSeparator />
          <ToolbarButton
            id="convert-to-task"
            icon={<CirclePlus className="size-4" />}
            pressed={false}
            onClick={onConvertToTask}
          />
        </>
      )}
      <ToolbarSeparator />
      <EditorCopyMenu editor={editor} labels={copyLabels} />
    </>
  );
  if (!toolsLabel) return secondary;
  return (
    <>
      {[...primary].map(control)}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
          >
            <Settings2 className="size-4" aria-hidden="true" />
            {toolsLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex w-80 max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1"
        >
          {secondary}
        </PopoverContent>
      </Popover>
    </>
  );
}
