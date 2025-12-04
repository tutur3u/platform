import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Node, nodeInputRule } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import { toast } from '../sonner';
import { getVideoDimensions, MAX_VIDEO_SIZE } from './media-utils';
import {
  createLoadingPlaceholder,
  findUploadPlaceholder,
  generateUploadId,
  videoUploadPlaceholderPluginKey,
} from './upload-placeholder';

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
        // Video upload placeholder plugin - manages loading state decorations
        new Plugin({
          key: videoUploadPlaceholderPluginKey,
          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, set) {
              // Map decorations through document changes
              set = set.map(tr.mapping, tr.doc);

              // Handle add/remove placeholder actions
              const action = tr.getMeta(videoUploadPlaceholderPluginKey);
              if (action?.add) {
                const { id, pos, width, height } = action.add;
                const placeholder = createLoadingPlaceholder(
                  width,
                  height,
                  'video'
                );
                const deco = Decoration.widget(pos, placeholder, { id });
                set = set.add(tr.doc, [deco]);
              }
              if (action?.remove) {
                set = set.remove(
                  set.find(
                    undefined,
                    undefined,
                    (spec: { id?: string }) => spec.id === action.remove.id
                  )
                );
              }
              return set;
            },
          },
          props: {
            decorations(state) {
              return this.getState(state);
            },
          },
        }),

        // Video paste plugin with upload and loading state
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
                    const uploadId = generateUploadId();

                    try {
                      // Validate file size (max 50MB for videos)
                      if (video.size > MAX_VIDEO_SIZE) {
                        const errorMessage = `Video '${video.name}' exceeds the 50MB limit`;
                        try {
                          toast.error(errorMessage);
                        } catch {
                          // Fallback to console if toast API is unavailable
                          console.error(errorMessage);
                        }
                        continue;
                      }

                      // Get video dimensions
                      let dimensions = { width: 640, height: 360 };
                      try {
                        dimensions = await getVideoDimensions(video);
                      } catch {
                        // Use default dimensions if we can't load the video
                      }

                      // Add loading placeholder
                      const placeholderTr = view.state.tr;
                      placeholderTr.setMeta(videoUploadPlaceholderPluginKey, {
                        add: {
                          id: uploadId,
                          pos: currentPos,
                          width: dimensions.width,
                          height: dimensions.height,
                        },
                      });
                      view.dispatch(placeholderTr);

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
                        // Remove placeholder on error
                        const removeTr = view.state.tr;
                        removeTr.setMeta(videoUploadPlaceholderPluginKey, {
                          remove: { id: uploadId },
                        });
                        view.dispatch(removeTr);
                        continue;
                      }

                      // Find the placeholder position (may have shifted)
                      const placeholder = findUploadPlaceholder(
                        view.state,
                        uploadId,
                        videoUploadPlaceholderPluginKey
                      );
                      const insertPos = placeholder?.pos ?? currentPos;

                      // Remove placeholder and insert actual video
                      const finalTr = view.state.tr;
                      finalTr.setMeta(videoUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });

                      // Create and insert the video node
                      const node = videoNode.create({ src: url });
                      finalTr.insert(insertPos, node);
                      view.dispatch(finalTr);

                      // Update position for next insertion
                      currentPos = insertPos + node.nodeSize;
                    } catch (error) {
                      console.error(
                        'Failed to upload pasted video:',
                        video.name,
                        error
                      );
                      // Remove placeholder on error
                      const removeTr = view.state.tr;
                      removeTr.setMeta(videoUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });
                      view.dispatch(removeTr);
                    }
                  }
                })();

                return true;
              },
            },
          },
        }),

        // Video drop plugin with upload and loading state
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
                    const uploadId = generateUploadId();

                    try {
                      // Validate file size (max 50MB)
                      if (video.size > MAX_VIDEO_SIZE) {
                        const errorMessage = `Video '${video.name}' exceeds the 50MB limit`;
                        try {
                          toast.error(errorMessage);
                        } catch {
                          // Fallback to console if toast API is unavailable
                          console.error(errorMessage);
                        }
                        continue;
                      }

                      // Get video dimensions
                      let dimensions = { width: 640, height: 360 };
                      try {
                        dimensions = await getVideoDimensions(video);
                      } catch {
                        // Use default dimensions if we can't load the video
                      }

                      // Add loading placeholder
                      const placeholderTr = view.state.tr;
                      placeholderTr.setMeta(videoUploadPlaceholderPluginKey, {
                        add: {
                          id: uploadId,
                          pos: currentPos,
                          width: dimensions.width,
                          height: dimensions.height,
                        },
                      });
                      view.dispatch(placeholderTr);

                      // Upload the video
                      const url = await onVideoUpload(video);

                      const node = schema.nodes.video?.create({ src: url });
                      if (!node) {
                        console.error(
                          'Video node not found. Available nodes:',
                          Object.keys(schema.nodes)
                        );
                        // Remove placeholder on error
                        const removeTr = view.state.tr;
                        removeTr.setMeta(videoUploadPlaceholderPluginKey, {
                          remove: { id: uploadId },
                        });
                        view.dispatch(removeTr);
                        continue;
                      }

                      // Find the placeholder position (may have shifted)
                      const placeholder = findUploadPlaceholder(
                        view.state,
                        uploadId,
                        videoUploadPlaceholderPluginKey
                      );
                      const insertPos = placeholder?.pos ?? currentPos;

                      // Remove placeholder and insert actual video
                      const finalTr = view.state.tr;
                      finalTr.setMeta(videoUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });

                      finalTr.insert(insertPos, node);
                      view.dispatch(finalTr);

                      // Update position for next insertion
                      currentPos = insertPos + node.nodeSize;
                    } catch (error) {
                      console.error(
                        'Failed to process dropped video:',
                        video.name,
                        error
                      );
                      // Remove placeholder on error
                      const removeTr = view.state.tr;
                      removeTr.setMeta(videoUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });
                      view.dispatch(removeTr);
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
