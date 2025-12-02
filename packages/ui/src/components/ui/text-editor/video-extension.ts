import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
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

// Plugin key for video upload placeholder decorations
const videoUploadPlaceholderPluginKey = new PluginKey('videoUploadPlaceholder');

// Generate unique ID for each upload
let videoUploadIdCounter = 0;
function generateVideoUploadId(): string {
  return `video-upload-${Date.now()}-${++videoUploadIdCounter}`;
}

/**
 * Create a loading placeholder element for uploading videos
 */
function createVideoLoadingPlaceholder(
  width: number,
  height: number
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className =
    'upload-placeholder relative inline-block my-4 rounded-md overflow-hidden';
  wrapper.style.width = `${Math.min(width, 600)}px`;
  wrapper.style.height = `${Math.min(height, 400)}px`;
  wrapper.style.maxWidth = '100%';
  wrapper.style.minWidth = '200px';
  wrapper.style.minHeight = '120px';

  const placeholder = document.createElement('div');
  placeholder.className =
    'w-full h-full bg-muted/60 rounded-md flex items-center justify-center';
  placeholder.style.backdropFilter = 'blur(4px)';

  // Spinner container
  const spinnerContainer = document.createElement('div');
  spinnerContainer.className = 'flex flex-col items-center gap-3';

  // Spinning loader - using CSS animation
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 32px;
    height: 32px;
    border: 3px solid rgba(156, 163, 175, 0.3);
    border-top-color: rgb(156, 163, 175);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  `;

  // Add keyframes for spin animation if not already present
  if (!document.querySelector('#upload-spinner-styles')) {
    const style = document.createElement('style');
    style.id = 'upload-spinner-styles';
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // Upload text
  const text = document.createElement('span');
  text.className = 'text-xs text-muted-foreground font-medium';
  text.textContent = 'Uploading video...';

  spinnerContainer.appendChild(spinner);
  spinnerContainer.appendChild(text);
  placeholder.appendChild(spinnerContainer);
  wrapper.appendChild(placeholder);

  return wrapper;
}

/**
 * Find placeholder decoration by upload ID
 */
function findVideoPlaceholder(
  state: any,
  id: string
): { pos: number; spec: any } | null {
  const decorations = videoUploadPlaceholderPluginKey.getState(state);
  if (!decorations) return null;

  let found: { pos: number; spec: any } | null = null;

  // Iterate through all decorations to find the one with matching ID
  const allDecos = decorations.find();
  for (const deco of allDecos) {
    if ((deco as any).spec?.id === id) {
      found = { pos: deco.from, spec: (deco as any).spec };
      break;
    }
  }

  return found;
}

/**
 * Load a video file and get its natural dimensions
 */
function getVideoDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };

    video.src = url;
  });
}

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
                const placeholder = createVideoLoadingPlaceholder(
                  width,
                  height
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
              paste: (view: EditorView, event: ClipboardEvent) => {
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
                    const uploadId = generateVideoUploadId();

                    try {
                      // Validate file size (max 50MB for videos)
                      const maxSize = 50 * 1024 * 1024;
                      if (video.size > maxSize) {
                        console.error(
                          'Video size must be less than 50MB:',
                          video.name
                        );
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
                      const placeholder = findVideoPlaceholder(
                        view.state,
                        uploadId
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
                    const uploadId = generateVideoUploadId();

                    try {
                      // Validate file size (max 50MB)
                      const maxSize = 50 * 1024 * 1024;
                      if (video.size > maxSize) {
                        console.error(
                          'Video size must be less than 50MB:',
                          video.name
                        );
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
                      const placeholder = findVideoPlaceholder(
                        view.state,
                        uploadId
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
