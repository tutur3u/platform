import { Node, nodeInputRule } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';

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
      toggleVideo: (src?: string) => ReturnType;
    };
  }
}

const VIDEO_INPUT_REGEX = /!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\)/;

export const Video = Node.create({
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
          commands.insertContent({
            type: this.name,
            attrs: { src },
          }),

      toggleVideo:
        (src?: string) =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph', src ? { src } : {}),
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
              const { schema } = view.state;
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

              if (!coordinates || typeof coordinates.pos !== 'number') {
                return true;
              }

              const initialPos = coordinates.pos;

              // Process files sequentially to avoid transaction conflicts
              (async () => {
                let currentPos = initialPos;
                for (const video of videos) {
                  try {
                    const dataUrl = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                          if (typeof e.target?.result === 'string') {
                            resolve(e.target.result);
                          } else {
                            reject(new Error('Failed to read file'));
                          }
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(video);
                      }
                    );

                    const node = schema.nodes.video?.create({ src: dataUrl });
                    if (!node) continue;

                    // Create fresh transaction from current view state
                    const tr = view.state.tr.insert(currentPos, node);
                    view.dispatch(tr);

                    // Update position for next insertion
                    currentPos += node.nodeSize;
                  } catch (error) {
                    console.error('Failed to process video:', error);
                  }
                }
              })();

              return true;
            },
          },
        },
      }),
    ];
  },
});
