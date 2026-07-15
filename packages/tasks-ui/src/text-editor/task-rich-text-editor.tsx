'use client';

import {
  RichTextEditor,
  type RichTextEditorProps,
} from '@tuturuuu/ui/text-editor/editor';
import { renderTaskMentionNodeView } from './task-mention-node-view';

export function TaskRichTextEditor(props: RichTextEditorProps) {
  return (
    <RichTextEditor {...props} renderTaskMention={renderTaskMentionNodeView} />
  );
}
