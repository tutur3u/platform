import { cx } from 'class-variance-authority';
import { common, createLowlight } from 'lowlight';
import {
  AIHighlight,
  CharacterCount,
  CodeBlockLowlight,
  Color,
  CustomKeymap,
  HighlightExtension,
  HorizontalRule,
  MarkdownExtension,
  Mathematics,
  Placeholder,
  StarterKit,
  TaskItem,
  TaskList,
  TextStyle,
  TiptapImage,
  TiptapLink,
  TiptapUnderline,
  Twitter,
  UpdatedImage,
  Youtube,
} from 'novel/extensions';
import { UploadImagesPlugin } from 'novel/plugins';
import AutoJoiner from 'tiptap-extension-auto-joiner';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';

// Configure AIHighlight for advanced functionality
const aiHighlight = AIHighlight;

// Configure the placeholder with any customizations
const placeholder = Placeholder.configure({
  placeholder: ({ node }) => {
    if (node.type.name === 'heading') {
      return `Heading ${node.attrs.level}`;
    }
    return "Press '/' for commands";
  },
  emptyEditorClass:
    'cursor-text before:content-[attr(data-placeholder)] before:absolute before:top-0 before:left-0 before:text-mauve-11 before:opacity-50 before-pointer-events-none',
  includeChildren: true,
});

// Configure TiptapLink with Tailwind CSS classes for styling
const tiptapLink = TiptapLink.configure({
  HTMLAttributes: {
    class: cx(
      'text-muted-foreground underline underline-offset-[3px] hover:text-primary transition-colors cursor-pointer'
    ),
  },
});

// Configure TiptapImage with base64 support and image classes for styling
const tiptapImage = TiptapImage.extend({
  addProseMirrorPlugins() {
    return [
      UploadImagesPlugin({
        imageClass: cx('opacity-40 rounded-lg border border-stone-200'),
      }),
    ];
  },
}).configure({
  allowBase64: true,
  HTMLAttributes: {
    class: cx('rounded-lg border border-muted'),
  },
});

// Configure UpdatedImage extension with styles
const updatedImage = UpdatedImage.configure({
  HTMLAttributes: {
    class: cx('rounded-lg border border-muted'),
  },
});

// Configure TaskList and TaskItem with styles
const taskList = TaskList.configure({
  HTMLAttributes: {
    class: cx('not-prose pl-2'),
  },
});
const taskItem = TaskItem.configure({
  HTMLAttributes: {
    class: cx('flex gap-2 items-start my-4'),
  },
  nested: true,
});

// Configure HorizontalRule with styling
const horizontalRule = HorizontalRule.configure({
  HTMLAttributes: {
    class: cx('mt-4 mb-6 border-t border-muted-foreground'),
  },
});

// StarterKit with custom configurations
const starterKit = StarterKit.configure({
  bulletList: {
    HTMLAttributes: {
      class: cx('list-disc list-outside leading-3 -mt-2'),
    },
  },
  orderedList: {
    HTMLAttributes: {
      class: cx('list-decimal list-outside leading-3 -mt-2'),
    },
  },
  listItem: {
    HTMLAttributes: {
      class: cx('leading-normal -mb-2'),
    },
  },
  blockquote: {
    HTMLAttributes: {
      class: cx('border-l-4 border-primary'),
    },
  },
  codeBlock: {
    HTMLAttributes: {
      class: cx('not-prose'),
    },
  },
  code: {
    HTMLAttributes: {
      class: cx(
        'rounded-md bg-muted px-1.5 py-1 font-mono font-medium text-warning'
      ),
      spellcheck: 'false',
    },
  },
  horizontalRule: false,
  dropcursor: {
    color: '#DBEAFE',
    width: 4,
  },
  gapcursor: false,
});

// Configure CodeBlockLowlight with common language support
const codeBlockLowlight = CodeBlockLowlight.configure({
  lowlight: createLowlight(common),
});

function extractVideoId(url: string) {
  if (!url) return null; // Check if URL is provided
  const match = url.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return match ? match[1] : null;
}

// Configure YouTube embedding with a wrapper div for resizing
const youtube = Youtube.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: cx('rounded-lg border border-muted overflow-hidden'),
      },
    };
  },
  addNodeView() {
    return ({ node }) => {
      const url = node.attrs?.src;
      const videoId = extractVideoId(url);

      // Create a resizable container div
      const container = document.createElement('div');
      container.className = cx(
        'relative',
        'rounded-lg border border-muted resize overflow-auto'
      );
      container.style.width = '100%';
      container.style.height = 'auto';

      if (videoId) {
        const video = document.createElement('iframe');
        video.src = `https://www.youtube.com/embed/${videoId}`;
        video.allowFullscreen = true;
        video.setAttribute('frameborder', '0');
        video.className = cx('w-full h-full'); // Make iframe responsive within the container

        container.appendChild(video);
      } else {
        container.innerText = url
          ? 'Invalid YouTube URL'
          : 'YouTube URL missing';
      }

      return {
        dom: container,
      };
    };
  },
}).configure({
  HTMLAttributes: {
    class: cx('rounded-lg border border-muted'),
  },
  inline: false,
});

// Configure Twitter embedding with styling
const twitter = Twitter.configure({
  HTMLAttributes: {
    class: cx('not-prose'),
  },
  inline: false,
});

// Configure Mathematics with LaTeX and styling options
const mathematics = Mathematics.configure({
  HTMLAttributes: {
    class: cx('text-foreground rounded p-1 hover:bg-accent cursor-pointer'),
  },
  katexOptions: {
    throwOnError: false,
  },
});

// Configure CharacterCount extension
const characterCount = CharacterCount.configure();

const autoJoiner = AutoJoiner.configure({
  elementsToJoin: ['bulletList', 'orderedList'], // default
});

const globalDragHandle = GlobalDragHandle.configure({
  dragHandleWidth: 20, // default

  // The scrollTreshold specifies how close the user must drag an element to the edge of the lower/upper screen for automatic
  // scrolling to take place. For example, scrollTreshold = 100 means that scrolling starts automatically when the user drags an
  // element to a position that is max. 99px away from the edge of the screen
  // You can set this to 0 to prevent auto scrolling caused by this extension
  scrollTreshold: 100, // default
});

// Export all extensions as default for use in the editor
export const defaultExtensions = [
  starterKit,
  placeholder,
  tiptapLink,
  tiptapImage,
  updatedImage,
  taskList,
  taskItem,
  horizontalRule,
  aiHighlight,
  codeBlockLowlight,
  youtube,
  twitter,
  mathematics,
  characterCount,
  TiptapUnderline,
  MarkdownExtension,
  HighlightExtension,
  TextStyle,
  Color,
  CustomKeymap,
  autoJoiner,
  globalDragHandle,
];
