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

interface VideoOptions {
  onVideoUpload?: (file: File) => Promise<string>;
}

export const Video = (options: VideoOptions = {}) =>
  Node.create({
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
      const { onVideoUpload } = options;

      return [
        // Video paste plugin with upload
        new Plugin({
          key: new PluginKey('videoPastePlugin'),

          props: {
            handleDOMEvents: {
              paste: (view, event: ClipboardEvent) => {
                if (!onVideoUpload) return false;

                const items = event.clipboardData?.items;
                if (!items) return false;

                // Filter and collect video files
                const videos = Array.from(items)
                  .map((item) =>
                    item.type.startsWith('video/') ? item.getAsFile() : null
                  )
                  .filter((file): file is File => file !== null);

                if (videos.length === 0) return false;

                event.preventDefault();

                // Process videos asynchronously
                (async () => {
                  const { state } = view;
                  const { from, to } = state.selection;

                  // Delete selected content if there's a selection (replace it)
                  let currentPos = from;
                  if (from !== to) {
                    const deleteTr = view.state.tr.delete(from, to);
                    view.dispatch(deleteTr);
                    currentPos = from;
                  }

                  // Process all videos sequentially
                  for (const video of videos) {
                    try {
                      console.log('Processing pasted video:', {
                        name: video.name,
                        type: video.type,
                        size: video.size,
                      });

                      // Validate file size (max 50MB for videos)
                      const maxSize = 50 * 1024 * 1024;
                      if (video.size > maxSize) {
                        console.error(
                          'Video size must be less than 50MB:',
                          video.name
                        );
                        continue;
                      }

                      // Upload the video
                      const url = await onVideoUpload(video);

                      // Get fresh state after upload
                      const currentState = view.state;
                      const videoNode = currentState.schema.nodes.video;

                      if (!videoNode) {
                        console.error(
                          'Video node not found. Available nodes:',
                          Object.keys(currentState.schema.nodes)
                        );
                        continue;
                      }

                      // Create and insert the video node
                      const node = videoNode.create({ src: url });

                      const tr = view.state.tr.insert(currentPos, node);
                      view.dispatch(tr);

                      // Update position for next insertion, mapping through the transaction
                      currentPos = tr.mapping.map(currentPos) + node.nodeSize;
                    } catch (error) {
                      console.error(
                        'Failed to upload pasted video:',
                        video.name,
                        error
                      );
                    }
                  }
                })();

                return true;
              },
            },
          },
        }),

        // Video drop plugin with upload
        new Plugin({
          key: new PluginKey('videoDropPlugin'),

          props: {
            handleDOMEvents: {
              drop(view, event) {
                if (!onVideoUpload) return false;

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
                      console.log('Processing dropped video:', {
                        name: video.name,
                        type: video.type,
                        size: video.size,
                      });

                      // If upload callback is provided, use it; otherwise use data URL
                      let url: string;
                      if (onVideoUpload) {
                        // Validate file size (max 50MB)
                        const maxSize = 50 * 1024 * 1024;
                        if (video.size > maxSize) {
                          console.error(
                            'Video size must be less than 50MB:',
                            video.name
                          );
                          continue;
                        }
                        url = await onVideoUpload(video);
                      } else {
                        // Fallback to data URL
                        url = await new Promise<string>((resolve, reject) => {
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
                        });
                      }

                      const node = schema.nodes.video?.create({ src: url });
                      if (!node) {
                        console.error(
                          'Video node not found. Available nodes:',
                          Object.keys(schema.nodes)
                        );
                        continue;
                      }

                      // Create fresh transaction from current view state
                      const tr = view.state.tr.insert(currentPos, node);
                      view.dispatch(tr);

                      // Update position for next insertion, mapping through the transaction
                      currentPos = tr.mapping.map(currentPos) + node.nodeSize;
                    } catch (error) {
                      console.error(
                        'Failed to process dropped video:',
                        video.name,
                        error
                      );
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
