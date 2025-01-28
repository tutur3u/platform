import { EditorInfo } from './EditorInfo';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@repo/ui/components/ui/alert-dialog';
import { Button } from '@repo/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export type EditorHeaderProps = {
  isSidebarOpen?: boolean;
  toggleSidebar?: () => void;
  editor: Editor;
};

export const EditorHeader = ({ editor }: EditorHeaderProps) => {
  const t = useTranslations();
  const { characters, words } = useEditorState({
    editor,
    selector: (ctx): { characters: number; words: number } => {
      const { characters, words } = ctx.editor?.storage.characterCount || {
        characters: () => 0,
        words: () => 0,
      };
      return { characters: characters(), words: words() };
    },
  });

  const handleClearContent = () => {
    editor.chain().focus().clearContent().run();
  };

  return (
    <div className="bg-background/95 text-foreground supports-[backdrop-filter]:bg-background/75 sticky top-0 z-50 flex flex-col gap-0.5 border-b backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <EditorInfo characters={characters} words={words} />
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 disabled:opacity-40"
                onClick={() => editor.commands.undo()}
                disabled={!editor.isEditable}
              >
                <Undo className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (⌘Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 disabled:opacity-40"
                onClick={() => editor.commands.redo()}
                disabled={!editor.isEditable}
              >
                <Redo className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
          </Tooltip>

          <div className="bg-border mx-2 h-4 w-px" />

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 disabled:opacity-40"
                    disabled={!editor.isEditable || characters === 0}
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('common.clear_all')}</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('common.clear_all_title')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('common.clear_all_description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearContent}>
                  {t('common.clear_all')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-0.5 px-4 py-1">
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('heading', { level: 1 }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                data-active={editor.isActive('heading', { level: 1 })}
              >
                <Heading1 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 1</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('heading', { level: 2 }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                data-active={editor.isActive('heading', { level: 2 })}
              >
                <Heading2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 2</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('heading', { level: 3 }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
                data-active={editor.isActive('heading', { level: 3 })}
              >
                <Heading3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 3</TooltipContent>
          </Tooltip>
        </div>

        <div className="bg-border mx-2 h-4 w-px" />

        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('bold') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleBold().run()}
                data-active={editor.isActive('bold')}
              >
                <Bold className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold (⌘B)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('italic') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                data-active={editor.isActive('italic')}
              >
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic (⌘I)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('underline') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                data-active={editor.isActive('underline')}
              >
                <Underline className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Underline (⌘U)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('strike') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                data-active={editor.isActive('strike')}
              >
                <Strikethrough className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Strikethrough (⌘⇧X)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('code') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleCode().run()}
                data-active={editor.isActive('code')}
              >
                <Code className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Code (⌘E)</TooltipContent>
          </Tooltip>
        </div>

        <div className="bg-border mx-2 h-4 w-px" />

        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('bulletList') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                data-active={editor.isActive('bulletList')}
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bullet List</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('orderedList') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                data-active={editor.isActive('orderedList')}
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Numbered List</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive('blockquote') && 'bg-muted'
                )}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                data-active={editor.isActive('blockquote')}
              >
                <Quote className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Quote</TooltipContent>
          </Tooltip>
        </div>

        <div className="bg-border mx-2 h-4 w-px" />

        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive({ textAlign: 'left' }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().setTextAlign('left').run()
                }
                data-active={editor.isActive({ textAlign: 'left' })}
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive({ textAlign: 'center' }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().setTextAlign('center').run()
                }
                data-active={editor.isActive({ textAlign: 'center' })}
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive({ textAlign: 'right' }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().setTextAlign('right').run()
                }
                data-active={editor.isActive({ textAlign: 'right' })}
              >
                <AlignRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Right</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'data-[active=true]:bg-muted h-8 px-2',
                  editor.isActive({ textAlign: 'justify' }) && 'bg-muted'
                )}
                onClick={() =>
                  editor.chain().focus().setTextAlign('justify').run()
                }
                data-active={editor.isActive({ textAlign: 'justify' })}
              >
                <AlignJustify className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Justify</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
