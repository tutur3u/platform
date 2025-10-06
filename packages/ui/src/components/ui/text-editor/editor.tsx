'use client';

import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Placeholder from '@tiptap/extension-placeholder';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import {
  type Editor,
  EditorContent,
  type JSONContent,
  Node,
  nodeInputRule,
  useEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Box,
  BriefcaseBusiness,
  Calendar,
  CircleCheck,
  User,
} from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { debounce } from 'lodash';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import ImageResize from 'tiptap-extension-resize-image';
import { ToolBar } from './tool-bar';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    video: {
      /**
       * Set a video node
       */
      setVideo: (src: string) => ReturnType;
      /**
       * Toggle a video
       */
      toggleVideo: (src: string) => ReturnType;
    };
  }
}

const VIDEO_INPUT_REGEX = /!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\)/;

const Video = Node.create({
  name: 'video',

  group: 'block',

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => (el as HTMLSpanElement).getAttribute('src'),
        renderHTML: (attrs) => ({ src: attrs.src }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'video',
        getAttrs: (el) => ({
          src: (el as HTMLVideoElement).getAttribute('src'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      { controls: 'true', style: 'width: 100%', ...HTMLAttributes },
      ['source', HTMLAttributes],
    ];
  },

  addCommands() {
    return {
      setVideo:
        (src: string) =>
        ({ commands }) =>
          commands.insertContent(
            `<video controls="true" style="width: 100%" src="${src}" />`
          ),

      toggleVideo:
        () =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph'),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: VIDEO_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => {
          const [, , src] = match;

          return { src };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('videoDropPlugin'),

        props: {
          handleDOMEvents: {
            drop(view, event) {
              const {
                state: { schema, tr },
                dispatch,
              } = view;
              const hasFiles = event.dataTransfer?.files?.length;

              if (!hasFiles) return false;

              const videos = Array.from(event.dataTransfer.files).filter(
                (file) => /video/i.test(file.type)
              );

              if (videos.length === 0) return false;

              event.preventDefault();

              const coordinates = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              videos.forEach((video) => {
                const reader = new FileReader();

                reader.onload = (readerEvent) => {
                  const node = schema.nodes.video?.create({
                    src: readerEvent.target?.result,
                  });

                  if (!node) return;
                  if (coordinates && typeof coordinates.pos === 'number') {
                    const transaction = tr.insert(coordinates?.pos, node);
                    dispatch(transaction);
                  }
                };

                reader.readAsDataURL(video);
              });

              return true;
            },
          },
        },
      }),
    ];
  },
});

interface MentionVisualMeta {
  prefix: string;
  pillClass: string;
  avatarClass: string;
  fallback: string;
  icon?: string;
}

const getMentionVisualMeta = (entityType?: string): MentionVisualMeta => {
  switch (entityType) {
    case 'workspace':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
        avatarClass:
          'border-dynamic-orange/30 bg-dynamic-orange/20 text-dynamic-orange',
        fallback: 'W',
        icon: renderToString(<BriefcaseBusiness className="h-3 w-3" />),
      };
    case 'project':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-cyan/40 bg-dynamic-cyan/10 text-dynamic-cyan',
        avatarClass:
          'border-dynamic-cyan/30 bg-dynamic-cyan/20 text-dynamic-cyan',
        fallback: 'P',
        icon: renderToString(<Box className="h-3 w-3" />),
      };
    case 'task':
      return {
        prefix: '#',
        pillClass:
          'leading-relaxed border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
        avatarClass:
          'border-dynamic-blue/30 bg-dynamic-blue/20 text-dynamic-blue',
        fallback: '#',
        icon: renderToString(<CircleCheck className="h-3 w-3" />),
      };
    case 'date':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-pink/40 bg-dynamic-pink/10 text-dynamic-pink',
        avatarClass:
          'border-dynamic-pink/30 bg-dynamic-pink/20 text-dynamic-pink',
        fallback: 'D',
        icon: renderToString(<Calendar className="h-3 w-3" />),
      };
    case 'external-user':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-gray/40 bg-dynamic-gray/10 text-dynamic-gray',
        avatarClass:
          'border-dynamic-gray/30 bg-dynamic-gray/20 text-dynamic-gray',
        fallback: '@',
        icon: renderToString(<User className="h-3 w-3" />),
      };
    case 'user':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
        avatarClass:
          'border-dynamic-green/30 bg-dynamic-green/20 text-dynamic-green',
        fallback: '@',
      };
    default:
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-border bg-muted text-muted-foreground',
        avatarClass: 'border-border bg-muted text-muted-foreground',
        fallback: '@',
      };
  }
};

const getInitials = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '??';
  return (
    trimmed
      .split(/\s+/)
      .map((part) => part?.[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '??'
  );
};

const Mention = Node.create({
  name: 'mention',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      userId: {
        default: null,
      },
      entityId: {
        default: null,
      },
      entityType: {
        default: 'user',
      },
      displayName: {
        default: null,
      },
      avatarUrl: {
        default: null,
      },
      subtitle: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention="true"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            userId: element.dataset.userId ?? null,
            entityId: element.dataset.entityId ?? null,
            entityType: element.dataset.entityType ?? 'user',
            displayName: element.dataset.displayName ?? null,
            avatarUrl: element.dataset.avatarUrl ?? null,
            subtitle: element.dataset.subtitle ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes };
    const userId = (attrs.userId as string | null) ?? null;
    const entityId = (attrs.entityId as string | null) ?? userId;
    const entityType = (attrs.entityType as string | null) ?? 'user';
    const displayNameRaw = (attrs.displayName as string | null) ?? null;
    const avatarUrl = (attrs.avatarUrl as string | null) ?? null;
    const subtitle = (attrs.subtitle as string | null) ?? null;

    delete attrs.userId;
    delete attrs.entityId;
    delete attrs.entityType;
    delete attrs.displayName;
    delete attrs.avatarUrl;
    delete attrs.subtitle;

    const displayName = (displayNameRaw || 'Member').trim();
    const visuals = getMentionVisualMeta(entityType);
    const initials = getInitials(displayName);
    const fallbackGlyph =
      entityType === 'user' || entityType === 'external-user'
        ? initials
        : visuals.fallback;

    const baseAttributes = {
      'data-mention': 'true',
      'data-user-id': userId ?? '',
      'data-entity-id': entityId ?? '',
      'data-entity-type': entityType,
      'data-display-name': displayName,
      'data-avatar-url': avatarUrl ?? '',
      'data-subtitle': subtitle ?? '',
      class: `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${visuals.pillClass}`,
      ...attrs,
    };

    const avatarNode: any = avatarUrl
      ? [
          'span',
          {
            class: `relative -ml-0.5 h-4 w-4 overflow-hidden rounded-full border ${visuals.avatarClass}`,
          },
          [
            'img',
            {
              src: avatarUrl,
              alt: displayName,
              class: 'h-full w-full object-cover',
            },
          ],
        ]
      : visuals.icon
        ? [
            'span',
            {
              class: `relative -ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${visuals.avatarClass}`,
              innerHTML: visuals.icon,
            },
          ]
        : [
            'span',
            {
              class: `relative -ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold uppercase ${visuals.avatarClass}`,
            },
            fallbackGlyph,
          ];

    return [
      'span',
      baseAttributes,
      avatarNode,
      [
        'span',
        { class: 'text-current font-semibold' },
        `${visuals.prefix}${displayName}`,
      ],
    ] as any;
  },

  addNodeView() {
    return ({ node }) => {
      let currentDisplayName =
        (node.attrs.displayName as string | null)?.trim() || 'Member';
      let currentAvatarUrl = node.attrs.avatarUrl as string | null;
      const userId = (node.attrs.userId as string | null) ?? '';
      let currentEntityId = (node.attrs.entityId as string | null) ?? userId;
      let currentEntityType =
        (node.attrs.entityType as string | null) ?? 'user';
      let currentSubtitle = (node.attrs.subtitle as string | null) ?? null;
      let visuals = getMentionVisualMeta(currentEntityType);

      const dom = document.createElement('span');
      dom.setAttribute('data-mention', 'true');
      dom.setAttribute('data-user-id', userId);
      dom.setAttribute('data-display-name', currentDisplayName);
      dom.setAttribute('data-entity-id', currentEntityId ?? '');
      dom.setAttribute('data-entity-type', currentEntityType);
      if (currentAvatarUrl)
        dom.setAttribute('data-avatar-url', currentAvatarUrl);
      if (currentSubtitle) dom.setAttribute('data-subtitle', currentSubtitle);
      dom.className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${visuals.pillClass}`;
      dom.contentEditable = 'false';
      dom.title = currentSubtitle
        ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
        : `${visuals.prefix}${currentDisplayName}`;

      const avatarWrapper = document.createElement('span');
      avatarWrapper.className = `relative -ml-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border text-[10px] font-semibold uppercase ${visuals.avatarClass}`;

      if (currentAvatarUrl) {
        const img = document.createElement('img');
        img.src = currentAvatarUrl;
        img.alt = currentDisplayName;
        img.className = 'h-full w-full object-cover';
        img.referrerPolicy = 'no-referrer';
        avatarWrapper.textContent = '';
        avatarWrapper.appendChild(img);
      } else if (visuals.icon) {
        avatarWrapper.innerHTML = visuals.icon;
      } else {
        avatarWrapper.textContent =
          currentEntityType === 'user' || currentEntityType === 'external-user'
            ? getInitials(currentDisplayName)
            : visuals.fallback;
      }

      const label = document.createElement('span');
      label.className = 'text-current font-semibold';
      label.textContent = `${visuals.prefix}${currentDisplayName}`;

      dom.appendChild(avatarWrapper);
      dom.appendChild(label);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mention') return false;
          const nextDisplayName =
            (updatedNode.attrs.displayName as string | null)?.trim() ||
            'Member';
          const nextAvatarUrl = updatedNode.attrs.avatarUrl as string | null;
          const nextEntityId =
            (updatedNode.attrs.entityId as string | null) ??
            (updatedNode.attrs.userId as string | null) ??
            null;
          const nextEntityType =
            (updatedNode.attrs.entityType as string | null) ?? 'user';
          const nextSubtitle =
            (updatedNode.attrs.subtitle as string | null) ?? null;

          if (nextDisplayName !== currentDisplayName) {
            label.textContent = `${visuals.prefix}${nextDisplayName}`;
            dom.setAttribute('data-display-name', nextDisplayName);
            currentDisplayName = nextDisplayName;
            if (!currentAvatarUrl) {
              if (
                currentEntityType === 'user' ||
                currentEntityType === 'external-user'
              ) {
                avatarWrapper.textContent = getInitials(currentDisplayName);
              } else if (visuals.icon) {
                avatarWrapper.innerHTML = visuals.icon;
              }
            }
          }

          if (nextAvatarUrl !== currentAvatarUrl) {
            if (nextAvatarUrl) {
              const img = document.createElement('img');
              img.src = nextAvatarUrl;
              img.alt = nextDisplayName;
              img.className = 'h-full w-full object-cover';
              img.referrerPolicy = 'no-referrer';
              avatarWrapper.textContent = '';
              avatarWrapper.appendChild(img);
              dom.setAttribute('data-avatar-url', nextAvatarUrl);
            } else {
              const nextVisuals = getMentionVisualMeta(nextEntityType);
              dom.removeAttribute('data-avatar-url');
              if (
                nextEntityType === 'user' ||
                nextEntityType === 'external-user'
              ) {
                avatarWrapper.textContent = getInitials(nextDisplayName);
              } else if (nextVisuals.icon) {
                avatarWrapper.innerHTML = nextVisuals.icon;
              } else {
                avatarWrapper.textContent = nextVisuals.fallback;
              }
            }
            currentAvatarUrl = nextAvatarUrl;
          }

          if (nextEntityType !== currentEntityType) {
            currentEntityType = nextEntityType;
            visuals = getMentionVisualMeta(currentEntityType);
            dom.setAttribute('data-entity-type', currentEntityType);
            dom.className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${visuals.pillClass}`;
            avatarWrapper.className = `relative -ml-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border text-[10px] font-semibold uppercase ${visuals.avatarClass}`;
            label.textContent = `${visuals.prefix}${currentDisplayName}`;
            if (!currentAvatarUrl) {
              if (
                currentEntityType === 'user' ||
                currentEntityType === 'external-user'
              ) {
                avatarWrapper.textContent = getInitials(currentDisplayName);
              } else if (visuals.icon) {
                avatarWrapper.innerHTML = visuals.icon;
              } else {
                avatarWrapper.textContent = visuals.fallback;
              }
            }
            dom.title = currentSubtitle
              ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
              : `${visuals.prefix}${currentDisplayName}`;
          }

          if (nextEntityId !== currentEntityId && nextEntityId !== null) {
            currentEntityId = nextEntityId;
            dom.setAttribute('data-entity-id', currentEntityId ?? '');
          }

          if (nextSubtitle !== currentSubtitle) {
            currentSubtitle = nextSubtitle;
            if (currentSubtitle) {
              dom.setAttribute('data-subtitle', currentSubtitle);
            } else {
              dom.removeAttribute('data-subtitle');
            }
            dom.title = currentSubtitle
              ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
              : `${visuals.prefix}${currentDisplayName}`;
          }

          dom.title = currentSubtitle
            ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
            : `${visuals.prefix}${currentDisplayName}`;

          return true;
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },
});

const hasContent = (node: JSONContent): boolean => {
  // Check for text content
  if (node.text && node.text.trim().length > 0) return true;

  // Check for media content (images, videos, YouTube embeds, etc.)
  if (
    node.type &&
    ['image', 'imageResize', 'youtube', 'video', 'mention'].includes(node.type)
  ) {
    return true;
  }

  // Recursively check children
  if (node.content && node.content.length > 0) {
    return node.content.some((child: JSONContent) => hasContent(child));
  }

  // Empty paragraphs or empty doc should return false
  return false;
};

interface RichTextEditorProps {
  content: JSONContent | null;
  onChange?: (content: JSONContent | null) => void;
  readOnly?: boolean;
  titlePlaceholder?: string;
  writePlaceholder?: string;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
  className?: string;
  workspaceId?: string;
  onImageUpload?: (file: File) => Promise<string>;
  flushPendingRef?: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;
  onArrowUp?: (cursorOffset?: number) => void;
  onArrowLeft?: () => void;
  editorRef?: React.MutableRefObject<any>;
  initialCursorOffset?: number | null;
  onEditorReady?: (editor: Editor) => void;
}

export function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  titlePlaceholder = 'What is the title?',
  writePlaceholder = 'Write something...',
  saveButtonLabel,
  savedButtonLabel,
  className,
  workspaceId,
  onImageUpload,
  flushPendingRef,
  onArrowUp,
  onArrowLeft,
  editorRef: externalEditorRef,
  initialCursorOffset,
  onEditorReady,
}: RichTextEditorProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingPastedImage, setIsUploadingPastedImage] = useState(false);

  // Use refs to ensure we have stable references for handlers
  const onImageUploadRef = useRef(onImageUpload);
  const workspaceIdRef = useRef(workspaceId);
  const onChangeRef = useRef(onChange);
  const onArrowUpRef = useRef(onArrowUp);
  const onArrowLeftRef = useRef(onArrowLeft);
  const debouncedOnChangeRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
    workspaceIdRef.current = workspaceId;
    onChangeRef.current = onChange;
    onArrowUpRef.current = onArrowUp;
    onArrowLeftRef.current = onArrowLeft;
  }, [onImageUpload, workspaceId, onChange, onArrowUp, onArrowLeft]);

  const debouncedOnChange = useMemo(
    () =>
      debounce((newContent: JSONContent) => {
        onChangeRef.current?.(hasContent(newContent) ? newContent : null);
        setHasChanges(false);
      }, 500),
    []
  );

  // Store debounced function ref for flushing
  useEffect(() => {
    debouncedOnChangeRef.current = debouncedOnChange;
  }, [debouncedOnChange]);

  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  const getEditorClasses = useMemo(() => {
    const baseClasses = [
      'border border-dynamic-border rounded-md bg-transparent',
      'max-w-none overflow-y-auto',
      // Typography base
      'text-foreground leading-relaxed',
      // First child margin reset
      '[&_:first-child]:mt-0',
      // Headings
      '[&_h1]:text-4xl [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-6 [&_h1]:mb-4',
      '[&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-3',
      '[&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2',
      '[&_h4]:text-xl [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mt-3 [&_h4]:mb-2',
      '[&_h5]:text-lg [&_h5]:font-semibold [&_h5]:text-foreground [&_h5]:mt-3 [&_h5]:mb-2',
      '[&_h6]:text-base [&_h6]:font-semibold [&_h6]:text-foreground [&_h6]:mt-3 [&_h6]:mb-2',
      // Paragraphs
      '[&_p]:my-3 [&_p]:leading-7',
      // Lists - general styling
      '[&_ul]:my-3 [&_ul]:ml-6 [&_ul]:px-4 [&_ul]:mr-[0.4rem]',
      '[&_ol]:my-3 [&_ol]:ml-6 [&_ol]:px-4 [&_ol]:mr-[0.4rem]',
      '[&_li]:my-1 [&_li]:leading-7',
      '[&_ul_li_p]:my-1',
      '[&_ol_li_p]:my-1',
      '[&_li_h1]:text-4xl [&_li_h2]:text-3xl [&_li_h3]:text-2xl',
      // Task list specific styles
      '[&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:ml-6 [&_ul[data-type="taskList"]]:pl-0 [&_ul[data-type="taskList"]]:pr-4 [&_ul[data-type="taskList"]]:mr-[0.4rem] [&_ul[data-type="taskList"]]:my-3',
      '[&_ul[data-type="taskList"]_li]:flex [&_ul[data-type="taskList"]_li]:items-start [&_ul[data-type="taskList"]_li]:my-1',
      '[&_ul[data-type="taskList"]_li>label]:flex-[0_0_auto] [&_ul[data-type="taskList"]_li>label]:mr-2 [&_ul[data-type="taskList"]_li>label]:select-none [&_ul[data-type="taskList"]_li>label]:pt-[0.453rem]',
      '[&_ul[data-type="taskList"]_li>div]:flex-1 [&_ul[data-type="taskList"]_li>div]:min-w-0',
      '[&_ul[data-type="taskList"]_li_p]:my-1',
      // Checkbox styling
      '[&_ul[data-type="taskList"]_input[type="checkbox"]]:appearance-none [&_ul[data-type="taskList"]_input[type="checkbox"]]:h-[18px] [&_ul[data-type="taskList"]_input[type="checkbox"]]:w-[18px]',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]]:cursor-pointer [&_ul[data-type="taskList"]_input[type="checkbox"]]:rounded-[4px] [&_ul[data-type="taskList"]_input[type="checkbox"]]:border-2 [&_ul[data-type="taskList"]_input[type="checkbox"]]:border-dynamic-border',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]]:bg-background [&_ul[data-type="taskList"]_input[type="checkbox"]]:transition-all [&_ul[data-type="taskList"]_input[type="checkbox"]]:duration-150',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]]:shrink-0',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]:hover]:border-dynamic-gray [&_ul[data-type="taskList"]_input[type="checkbox"]:hover]:bg-dynamic-gray/10 [&_ul[data-type="taskList"]_input[type="checkbox"]:hover]:scale-105',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]:focus]:outline-none [&_ul[data-type="taskList"]_input[type="checkbox"]:focus]:ring-2 [&_ul[data-type="taskList"]_input[type="checkbox"]:focus]:ring-dynamic-gray/30 [&_ul[data-type="taskList"]_input[type="checkbox"]:focus]:ring-offset-2 [&_ul[data-type="taskList"]_input[type="checkbox"]:focus]:border-dynamic-gray',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]:checked]:bg-dynamic-gray/30 [&_ul[data-type="taskList"]_input[type="checkbox"]:checked]:border-dynamic-gray',
      '[&_ul[data-type="taskList"]_input[type="checkbox"]:checked:hover]:bg-dynamic-gray/50 [&_ul[data-type="taskList"]_input[type="checkbox"]:checked:hover]:border-dynamic-gray/90',
      `[&_ul[data-type="taskList"]_input[type="checkbox"]:checked]:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M4%208l2.5%202.5L12%205%22%2F%3E%3C%2Fsvg%3E')]`,
      '[&_ul[data-type="taskList"]_input[type="checkbox"]:checked]:bg-center [&_ul[data-type="taskList"]_input[type="checkbox"]:checked]:bg-no-repeat [&_ul[data-type="taskList"]_input[type="checkbox"]:checked]:bg-[length:14px_14px]',
      // Nested task lists
      '[&_ul[data-type="taskList"]_ul[data-type="taskList"]]:my-0 [&_ul[data-type="taskList"]_ul[data-type="taskList"]]:ml-0',
      // Blockquotes
      '[&_blockquote]:border-l-4 [&_blockquote]:border-dynamic-border [&_blockquote]:pl-4 [&_blockquote]:my-4',
      '[&_blockquote]:text-muted-foreground [&_blockquote]:italic',
      // Code
      '[&_code]:text-dynamic-pink [&_code]:bg-dynamic-pink/10 [&_code]:px-1.5 [&_code]:py-0.5',
      '[&_code]:rounded [&_code]:text-sm [&_code]:font-mono',
      '[&_pre]:bg-dynamic-border/50 [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:my-4 [&_pre]:overflow-x-auto',
      '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-foreground',
      // Strong/Bold
      '[&_strong]:font-bold [&_strong]:text-foreground',
      '[&_b]:font-bold [&_b]:text-foreground',
      // Emphasis/Italic
      '[&_em]:italic [&_em]:text-foreground',
      '[&_i]:italic [&_i]:text-foreground',
      // Links (ensure they maintain cyan color even when bold)
      '[&_a]:text-dynamic-cyan [&_a]:underline [&_a]:cursor-pointer',
      '[&_a:hover]:text-dynamic-cyan/80',
      '[&_a_strong]:text-dynamic-cyan [&_a_b]:text-dynamic-cyan',
      '[&_strong_a]:text-dynamic-cyan [&_b_a]:text-dynamic-cyan',
      // Horizontal rule
      '[&_hr]:border-dynamic-border [&_hr]:my-8',
      // Tables
      '[&_table]:w-full [&_table]:my-4 [&_table]:border-collapse',
      '[&_th]:border [&_th]:border-dynamic-border [&_th]:px-4 [&_th]:py-2 [&_th]:font-semibold',
      '[&_th]:bg-dynamic-border/20 [&_th]:text-foreground',
      '[&_td]:border [&_td]:border-dynamic-border [&_td]:px-4 [&_td]:py-2',
      // Placeholder styles
      '[&_*:is(p,h1,h2,h3).is-empty::before]:content-[attr(data-placeholder)]',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:text-muted-foreground',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:float-left',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:h-0',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:pointer-events-none',
      className,
    ].filter(Boolean);
    return baseClasses.join(' ');
  }, [className]);

  const editor = useEditor({
    onCreate: ({ editor }) => {
      if (externalEditorRef) {
        externalEditorRef.current = editor;
      }
      onEditorReady?.(editor);
    },
    extensions: [
      StarterKit.configure({
        link: false,
        strike: false,
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc ml-3',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal ml-3',
          },
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return titlePlaceholder;
          }
          return writePlaceholder;
        },
        emptyNodeClass: 'is-empty',
      }),
      Highlight,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class:
            'text-dynamic-cyan hover:text-dynamic-cyan/80 underline cursor-pointer transition-colors',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        validate: (href) => {
          // Allow http/https URLs and mailto links
          return /^https?:\/\/.+/.test(href) || /^mailto:.+@.+\..+/.test(href);
        },
        protocols: ['http', 'https', 'mailto'],
        shouldAutoLink: () => {
          // Auto-link URLs but not in code blocks
          return true;
        },
      }),
      Strike,
      Subscript,
      Superscript,
      Mention,
      TaskItem.configure({
        nested: true,
      }),
      TaskList,
      Image.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-md',
        },
      }),
      ImageResize.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-md',
        },
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        width: 640,
        height: 360,
        HTMLAttributes: {
          class: 'rounded-md my-4',
        },
      }),
      Video.configure({
        HTMLAttributes: {
          class: 'rounded-md my-4',
        },
      }),
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: getEditorClasses,
      },
      handleKeyDown: (view, event) => {
        // Prevent Ctrl+Enter / Cmd+Enter from creating a new line
        // Let the parent component handle the save action
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          return true;
        }

        const { state, dispatch } = view;
        const { selection } = state;
        const { $from } = selection;

        // Handle Backspace
        if (event.key === 'Backspace' && onArrowUpRef.current) {
          console.log('Backspace at pos:', $from.pos);

          // Check if we're on the first line
          const coordsAtCursor = view.coordsAtPos($from.pos);
          const coordsAtStart = view.coordsAtPos(1);
          const isOnFirstLine =
            coordsAtCursor &&
            coordsAtStart &&
            Math.abs(coordsAtCursor.top - coordsAtStart.top) < 5;

          console.log('Is on first line:', isOnFirstLine);

          if (isOnFirstLine) {
            const firstChild = state.doc.firstChild;
            console.log('First child:', {
              type: firstChild?.type.name,
              text: firstChild?.textContent,
              isEmpty: firstChild?.textContent.trim() === '',
              nodeSize: firstChild?.nodeSize,
            });

            // If cursor is at the absolute start (position 1)
            if ($from.pos === 1) {
              const firstChild = state.doc.firstChild;

              // If first line is empty and there's a second line, delete the empty line
              if (firstChild && firstChild.textContent.trim() === '') {
                const secondChild = state.doc.maybeChild(1);
                if (secondChild) {
                  console.log(
                    'Empty first line - manually deleting via commands'
                  );
                  event.preventDefault();

                  // Use commands to delete the node
                  const tr = state.tr;
                  const nodeSize = firstChild.nodeSize;

                  // Delete from position 0 to end of first child (including the node itself)
                  tr.delete(0, nodeSize);

                  // Dispatch and trigger onChange manually
                  dispatch(tr);

                  // Manually trigger onChange since we're in handleKeyDown
                  if (!readOnly && onChangeRef.current) {
                    const newJson = tr.doc.toJSON();
                    onChangeRef.current(hasContent(newJson) ? newJson : null);
                  }

                  return true;
                }
              }

              // If first line is NOT empty, go to title
              console.log('Non-empty first line - going to title');
              event.preventDefault();
              onArrowUpRef.current();
              return true;
            }
          }
        }

        // Handle ArrowUp when on the first line
        if (event.key === 'ArrowUp' && onArrowUpRef.current) {
          // Try to resolve a position one line up by checking textBetween
          // If we're at the very start of the document (pos 1), go to title
          if ($from.pos === 1) {
            event.preventDefault();
            onArrowUpRef.current(0); // At the start, offset is 0
            return true;
          }

          // Check if we're in a position where up arrow won't move us
          // This happens when we're on the first line of the first block
          const coordsAtCursor = view.coordsAtPos($from.pos);
          const coordsAtStart = view.coordsAtPos(1);

          // If cursor is on the same line as the start, go to title
          if (
            coordsAtCursor &&
            coordsAtStart &&
            Math.abs(coordsAtCursor.top - coordsAtStart.top) < 5
          ) {
            event.preventDefault();

            // Calculate character offset from start of the first line
            // Position 1 is the start of the document, $from.pos is current cursor
            // Since we're on the first line, the offset is simply the distance from position 1
            const offset = $from.pos - 1;

            onArrowUpRef.current(offset);
            return true;
          }
        }

        // Handle ArrowLeft when at the very start of the document
        if (event.key === 'ArrowLeft' && onArrowLeftRef.current) {
          // If we're at position 1 (start of document), go back to title
          if ($from.pos === 1) {
            event.preventDefault();
            onArrowLeftRef.current();
            return true;
          }
        }

        return false;
      },
      handlePaste: (view, event) => {
        // Handle image and video paste
        const items = event.clipboardData?.items;
        if (!items || !onImageUploadRef.current || !workspaceIdRef.current)
          return false;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item) continue;

          // Debug: Log the MIME type to console
          console.log('Pasted item type:', item.type);

          const isImage = item.type.startsWith('image/');
          const isVideo = item.type.startsWith('video/');

          if (isImage || isVideo) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            console.log('Detected file:', {
              name: file.name,
              type: file.type,
              size: file.size,
              isImage,
              isVideo,
            });

            // Validate file size (max 50MB for videos, 5MB for images)
            const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
            if (file.size > maxSize) {
              toast.error(
                isVideo
                  ? 'Video size must be less than 50MB'
                  : 'Image size must be less than 5MB'
              );
              return true;
            }

            // Upload file asynchronously
            setIsUploadingPastedImage(true);
            onImageUploadRef
              .current(file)
              .then((url) => {
                const { state } = view;
                const { from } = state.selection;

                if (isImage) {
                  // ImageResize extension uses 'imageResize' node name
                  const imageNode =
                    state.schema.nodes.imageResize || state.schema.nodes.image;
                  if (imageNode) {
                    const transaction = state.tr.insert(
                      from,
                      imageNode.create({ src: url })
                    );
                    view.dispatch(transaction);
                    toast.success('Image uploaded successfully');
                  } else {
                    console.error(
                      'Available nodes:',
                      Object.keys(state.schema.nodes)
                    );
                    toast.error('Image node not found');
                  }
                } else if (isVideo) {
                  // Video node
                  const videoNode = state.schema.nodes.video;
                  if (videoNode) {
                    const transaction = state.tr.insert(
                      from,
                      videoNode.create({ src: url })
                    );
                    view.dispatch(transaction);
                    toast.success('Video uploaded successfully');
                  } else {
                    console.error(
                      'Available nodes:',
                      Object.keys(state.schema.nodes)
                    );
                    toast.error('Video node not found');
                  }
                }
              })
              .catch((error) => {
                console.error('Failed to upload pasted file:', error);
                toast.error(
                  `Failed to upload ${isVideo ? 'video' : 'image'}. Please try again.`
                );
              })
              .finally(() => {
                setIsUploadingPastedImage(false);
              });

            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!readOnly) {
        setHasChanges(true);
        debouncedOnChange(editor.getJSON());
      }
    },
  });

  // Update editor's editable state when readOnly prop changes
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Handle initial cursor positioning when focusing from title
  useEffect(() => {
    if (
      editor &&
      initialCursorOffset !== null &&
      initialCursorOffset !== undefined
    ) {
      // Use requestAnimationFrame to ensure editor is fully ready
      requestAnimationFrame(() => {
        try {
          const doc = editor.state.doc;
          const firstNode = doc.firstChild;

          if (firstNode) {
            // Calculate position: 1 (start of doc) + offset within first line
            // Cap it at the length of the first text node
            const firstTextLength = firstNode.textContent.length;
            const actualOffset = Math.min(initialCursorOffset, firstTextLength);
            const newPos = Math.max(
              1,
              Math.min(1 + actualOffset, doc.content.size - 1)
            );

            // Create a text selection at the target position
            const tr = editor.state.tr.setSelection(
              TextSelection.near(doc.resolve(newPos))
            );
            editor.view.dispatch(tr);
          }
        } catch (error) {
          console.error('Error setting cursor position:', error);
        }
      });
    }
  }, [editor, initialCursorOffset]);

  const handleSave = useCallback(() => {
    if (editor && !readOnly) {
      setHasChanges(true);
      debouncedOnChange(editor.getJSON());
    }
  }, [editor, readOnly, debouncedOnChange]);

  // Expose flush method via ref - returns current content
  useEffect(() => {
    if (!flushPendingRef || !editor) return;

    flushPendingRef.current = () => {
      // Flush pending debounced changes immediately
      if (debouncedOnChangeRef.current) {
        debouncedOnChangeRef.current.flush();
      }
      // Get current editor content
      const currentContent = editor.getJSON();
      const finalContent = hasContent(currentContent) ? currentContent : null;

      // Also call onChange to update parent state
      onChangeRef.current?.(finalContent);

      // Return the content so caller can use it immediately
      return finalContent;
    };
  }, [editor, flushPendingRef]);

  return (
    <div className="group relative h-full">
      {!readOnly && (
        <ToolBar
          editor={editor}
          hasChanges={hasChanges}
          onSave={handleSave}
          saveButtonLabel={saveButtonLabel}
          savedButtonLabel={savedButtonLabel}
          workspaceId={workspaceId}
          onImageUpload={onImageUpload}
        />
      )}
      <EditorContent editor={editor} className="h-full" />
      {isUploadingPastedImage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 shadow-lg">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-dynamic-orange border-t-transparent" />
            <span className="text-sm">Uploading media...</span>
          </div>
        </div>
      )}
    </div>
  );
}
