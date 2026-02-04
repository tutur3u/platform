import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import ImageResize from 'tiptap-extension-resize-image';
import {
  getImageDimensions,
  getVideoDimensions,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from './media-utils';
import {
  createLoadingPlaceholder,
  findUploadPlaceholder,
  generateUploadId,
  imageUploadPlaceholderPluginKey,
} from './upload-placeholder';

export type ImageSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Size presets in pixels (will be calculated based on editor width)
const SIZE_PERCENTAGES: Record<ImageSize, number> = {
  xs: 25, // 25% of editor width
  sm: 40, // 40%
  md: 60, // 60% (default)
  lg: 80, // 80%
  xl: 100, // 100% (full width)
};

/**
 * Snap a width value to the nearest preset size
 */
function snapToNearestSize(
  actualWidth: number,
  containerWidth: number
): number {
  const percentage = (actualWidth / containerWidth) * 100;

  // Find the closest preset
  let closestSize: ImageSize = 'md';
  let smallestDiff = Number.POSITIVE_INFINITY;

  for (const [size, percent] of Object.entries(SIZE_PERCENTAGES)) {
    const diff = Math.abs(percentage - percent);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestSize = size as ImageSize;
    }
  }

  // Return the snapped width
  return (SIZE_PERCENTAGES[closestSize] / 100) * containerWidth;
}

/**
 * Calculate the best preset width for an image based on its natural dimensions
 * This ensures pasted/dropped images don't get snapped on first click
 */
function calculatePresetWidth(
  naturalWidth: number,
  containerWidth: number
): number {
  // If image is smaller than the smallest preset (25%), use its natural width
  const smallestPreset = (SIZE_PERCENTAGES.xs / 100) * containerWidth;
  if (naturalWidth <= smallestPreset) {
    return naturalWidth;
  }

  // Find the best preset that fits the image without upscaling
  const presetSizes: ImageSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

  for (const size of presetSizes) {
    const presetWidth = (SIZE_PERCENTAGES[size] / 100) * containerWidth;
    if (naturalWidth <= presetWidth) {
      // Use this preset as it fits the image
      return presetWidth;
    }
  }

  // Image is larger than all presets, use the largest (xl = 100%)
  return containerWidth;
}

interface ImageOptions {
  onImageUpload?: (file: File) => Promise<string>;
  onVideoUpload?: (file: File) => Promise<string>;
}

/**
 * Adjusts a drop position to the nearest valid block-level insertion point.
 * If dropping inside a textblock (paragraph, heading, etc.), moves to after that block.
 * This ensures block-level nodes like images are not inserted mid-sentence.
 */
function adjustToBlockLevelPosition(pos: number, state: EditorState): number {
  const $pos = state.doc.resolve(pos);

  // If parent is a textblock (paragraph, heading, etc.), insert after it
  if ($pos.parent.isTextblock) {
    return $pos.after($pos.depth);
  }

  return pos;
}

// Extend ImageResizeOptions to include the additional Tiptap Image options
interface ExtendedImageResizeOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, any>;
  minWidth?: number;
  maxWidth?: number;
}

export const CustomImage = (options: ImageOptions = {}) => {
  const baseExtension = ImageResize.extend<ExtendedImageResizeOptions>({
    addAttributes() {
      const parentAttrs = this.parent?.() || {};

      return {
        ...parentAttrs,
        // Only add legacy attributes that aren't handled by parent
        containerStyle: {
          default: null,
        },
        wrapperStyle: {
          default: null,
        },
      };
    },

    addKeyboardShortcuts() {
      return {
        Backspace: ({ editor }: { editor: import('@tiptap/core').Editor }) => {
          const { state } = editor;
          const { selection } = state;
          const { $from, empty } = selection;

          // Only handle when cursor is at start of a node (empty selection)
          if (!empty) return false;

          // Check if the node before cursor is an image
          const nodeBefore = $from.nodeBefore;
          if (
            nodeBefore &&
            (nodeBefore.type.name === 'imageResize' ||
              nodeBefore.type.name === 'image')
          ) {
            // If we're at the start of an empty paragraph after an image,
            // delete the empty paragraph instead of the image
            const parent = $from.parent;
            if (parent.isTextblock && parent.content.size === 0) {
              // Delete the empty paragraph
              const tr = state.tr.delete($from.before(), $from.after());
              editor.view.dispatch(tr);
              return true;
            }

            // Otherwise, prevent deletion of the image when pressing backspace
            // at the start of content immediately after the image
            return true;
          }

          return false;
        },
      };
    },

    addProseMirrorPlugins() {
      const parentPlugins = this.parent?.() || [];
      const { onImageUpload, onVideoUpload } = options;

      return [
        ...parentPlugins,

        // Upload placeholder plugin - manages loading state decorations
        new Plugin({
          key: imageUploadPlaceholderPluginKey,
          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, set) {
              // Map decorations through document changes
              set = set.map(tr.mapping, tr.doc);

              // Handle add/remove placeholder actions
              const action = tr.getMeta(imageUploadPlaceholderPluginKey);
              if (action?.add) {
                const { id, pos, width, height, type } = action.add;
                const placeholder = createLoadingPlaceholder(
                  width,
                  height,
                  type
                );
                const deco = Decoration.widget(pos, placeholder, {
                  id,
                  type,
                });
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

        // Image resize snap plugin
        new Plugin({
          key: new PluginKey('imageResizeSnapPlugin'),

          appendTransaction(_transactions, oldState, newState) {
            const tr = newState.tr;
            let modified = false;

            // Get container width from the DOM
            const editorElement = document.querySelector(
              '.ProseMirror'
            ) as HTMLElement;
            const containerWidth = editorElement?.clientWidth || 800;

            // Check each node for resize changes
            newState.doc.descendants((node, pos) => {
              if (
                node.type.name !== 'imageResize' &&
                node.type.name !== 'image'
              )
                return;

              const width = node.attrs.width as number | null;
              if (!width) return;

              // Calculate all preset widths
              const presetWidths = Object.values(SIZE_PERCENTAGES).map(
                (percent) => (percent / 100) * containerWidth
              );

              // Check if already at a preset (within 10px tolerance for stability)
              const isAtPreset = presetWidths.some(
                (presetWidth) => Math.abs(width - presetWidth) <= 10
              );

              if (isAtPreset) return;

              // Check if width changed in this transaction
              // Validate position exists in oldState before accessing
              if (pos < 0 || pos >= oldState.doc.content.size) {
                // Position doesn't exist in old state (e.g., new node), skip
                return;
              }

              const oldNode = oldState.doc.nodeAt(pos);

              // If node didn't exist in old state or isn't an image, skip
              if (
                !oldNode ||
                (oldNode.type.name !== 'imageResize' &&
                  oldNode.type.name !== 'image')
              ) {
                return;
              }

              const widthChanged = oldNode.attrs.width !== width;

              if (widthChanged) {
                // Snap to nearest preset
                const snappedWidth = snapToNearestSize(width, containerWidth);

                // Only snap if the change is significant
                if (Math.abs(width - snappedWidth) > 10) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    width: snappedWidth,
                  });
                  modified = true;
                }
              }
            });

            return modified ? tr : null;
          },
        }),

        // Image paste plugin with upload and loading state
        new Plugin({
          key: new PluginKey('imagePastePlugin'),

          props: {
            handleDOMEvents: {
              paste: (view, event: ClipboardEvent) => {
                if (!onImageUpload) return false;

                const items = event.clipboardData?.items;
                if (!items) return false;

                // Filter and collect image files
                const images = Array.from(items)
                  .map((item) =>
                    item.type.startsWith('image/') ? item.getAsFile() : null
                  )
                  .filter((file): file is File => file !== null);

                if (images.length === 0) return false;

                event.preventDefault();

                const { state } = view;
                const { from, to } = state.selection;

                // Get container width for sizing calculations
                const editorElement = view.dom as HTMLElement;
                const containerWidth =
                  editorElement.querySelector('.ProseMirror')?.clientWidth ||
                  editorElement.clientWidth ||
                  800;

                // Process images asynchronously
                (async () => {
                  // Delete selected content if there's a selection (replace it)
                  let currentPos = from;
                  if (from !== to) {
                    const deleteTr = view.state.tr.delete(from, to);
                    view.dispatch(deleteTr);
                    currentPos = from;
                  }

                  // Process all images sequentially
                  for (const image of images) {
                    const uploadId = generateUploadId();

                    try {
                      // Validate file size (max 5MB for images)
                      if (image.size > MAX_IMAGE_SIZE) {
                        console.error(
                          'Image size must be less than 5MB:',
                          image.name
                        );
                        continue;
                      }

                      // Get image natural dimensions before upload
                      const dimensions = await getImageDimensions(image);

                      // Calculate display dimensions
                      const displayWidth = calculatePresetWidth(
                        dimensions.width,
                        containerWidth
                      );
                      const aspectRatio = dimensions.height / dimensions.width;
                      const displayHeight = displayWidth * aspectRatio;

                      // Add loading placeholder
                      const placeholderTr = view.state.tr;
                      placeholderTr.setMeta(imageUploadPlaceholderPluginKey, {
                        add: {
                          id: uploadId,
                          pos: currentPos,
                          width: displayWidth,
                          height: displayHeight,
                          type: 'image' as const,
                        },
                      });
                      view.dispatch(placeholderTr);

                      // Upload the image
                      const url = await onImageUpload(image);

                      // Get fresh state after upload
                      const currentState = view.state;
                      const imageNode = currentState.schema.nodes.imageResize;

                      if (!imageNode) {
                        console.error(
                          'Image node not found. Available nodes:',
                          Object.keys(currentState.schema.nodes)
                        );
                        // Remove placeholder on error
                        const removeTr = view.state.tr;
                        removeTr.setMeta(imageUploadPlaceholderPluginKey, {
                          remove: { id: uploadId },
                        });
                        view.dispatch(removeTr);
                        continue;
                      }

                      // Find the placeholder position (may have shifted)
                      const placeholder = findUploadPlaceholder(
                        view.state,
                        uploadId,
                        imageUploadPlaceholderPluginKey
                      );
                      const insertPos = placeholder?.pos ?? currentPos;

                      // Remove placeholder and insert actual image
                      const finalTr = view.state.tr;
                      finalTr.setMeta(imageUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });

                      // Create and insert the image node
                      const node = imageNode.create({
                        src: url,
                        width: displayWidth,
                      });

                      finalTr.insert(insertPos, node);
                      view.dispatch(finalTr);

                      // Update position for next insertion
                      currentPos = insertPos + node.nodeSize;
                    } catch (error) {
                      console.error(
                        'Failed to upload pasted image:',
                        image.name,
                        error
                      );
                      // Remove placeholder on error
                      const removeTr = view.state.tr;
                      removeTr.setMeta(imageUploadPlaceholderPluginKey, {
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

        // Image/Video drop plugin with upload and loading state
        new Plugin({
          key: new PluginKey('imageDropPlugin'),

          props: {
            handleDOMEvents: {
              drop: (view: EditorView, event: DragEvent) => {
                if (!onImageUpload && !onVideoUpload) return false;

                const hasFiles = event.dataTransfer?.files?.length;
                if (!hasFiles) return false;

                const files = Array.from(event.dataTransfer?.files || []);
                const images = files.filter((file) => /image/i.test(file.type));
                const videos = files.filter((file) => /video/i.test(file.type));

                if (images.length === 0 && videos.length === 0) return false;

                event.preventDefault();

                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });

                if (!coordinates || typeof coordinates.pos !== 'number') {
                  return true;
                }

                // Adjust position to block-level boundary to prevent dropping inside text
                const initialPos = adjustToBlockLevelPosition(
                  coordinates.pos,
                  view.state
                );

                // Get container width for sizing calculations
                const editorElement = view.dom as HTMLElement;
                const containerWidth =
                  editorElement.querySelector('.ProseMirror')?.clientWidth ||
                  editorElement.clientWidth ||
                  800;

                // Process files sequentially to avoid transaction conflicts
                (async () => {
                  let currentPos = initialPos;

                  // Process images
                  for (const image of images) {
                    if (!onImageUpload) continue;
                    const uploadId = generateUploadId();

                    try {
                      // Validate file size (max 5MB)
                      if (image.size > MAX_IMAGE_SIZE) {
                        console.error('Image too large:', image.name);
                        continue;
                      }

                      // Get image natural dimensions before upload
                      const dimensions = await getImageDimensions(image);

                      // Calculate display dimensions
                      const displayWidth = calculatePresetWidth(
                        dimensions.width,
                        containerWidth
                      );
                      const aspectRatio = dimensions.height / dimensions.width;
                      const displayHeight = displayWidth * aspectRatio;

                      // Add loading placeholder
                      const placeholderTr = view.state.tr;
                      placeholderTr.setMeta(imageUploadPlaceholderPluginKey, {
                        add: {
                          id: uploadId,
                          pos: currentPos,
                          width: displayWidth,
                          height: displayHeight,
                          type: 'image' as const,
                        },
                      });
                      view.dispatch(placeholderTr);

                      // Upload the image
                      const url = await onImageUpload(image);

                      // Try imageResize first (custom), fallback to image (base)
                      const { schema } = view.state;
                      const nodeType =
                        schema.nodes.imageResize || schema.nodes.image;
                      if (!nodeType) {
                        console.error('No image node type found in schema');
                        // Remove placeholder on error
                        const removeTr = view.state.tr;
                        removeTr.setMeta(imageUploadPlaceholderPluginKey, {
                          remove: { id: uploadId },
                        });
                        view.dispatch(removeTr);
                        continue;
                      }

                      // Find the placeholder position (may have shifted)
                      const placeholder = findUploadPlaceholder(
                        view.state,
                        uploadId,
                        imageUploadPlaceholderPluginKey
                      );
                      const insertPos = placeholder?.pos ?? currentPos;

                      // Remove placeholder and insert actual image
                      const finalTr = view.state.tr;
                      finalTr.setMeta(imageUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });

                      const node = nodeType.create({
                        src: url,
                        width: displayWidth,
                      });

                      finalTr.insert(insertPos, node);
                      view.dispatch(finalTr);

                      // Update position for next insertion
                      currentPos = insertPos + node.nodeSize;
                    } catch (error) {
                      console.error('Failed to upload image:', error);
                      // Remove placeholder on error
                      const removeTr = view.state.tr;
                      removeTr.setMeta(imageUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });
                      view.dispatch(removeTr);
                    }
                  }

                  // Process videos
                  for (const video of videos) {
                    if (!onVideoUpload) continue;
                    const uploadId = generateUploadId();

                    try {
                      // Validate file size (max 50MB for videos)
                      if (video.size > MAX_VIDEO_SIZE) {
                        console.error('Video too large:', video.name);
                        continue;
                      }

                      // Get video dimensions
                      let dimensions = { width: 640, height: 360 };
                      try {
                        dimensions = await getVideoDimensions(video);
                      } catch {
                        // Use default dimensions if we can't load the video
                      }

                      // Calculate display dimensions
                      const displayWidth = calculatePresetWidth(
                        dimensions.width,
                        containerWidth
                      );
                      const aspectRatio = dimensions.height / dimensions.width;
                      const displayHeight = displayWidth * aspectRatio;

                      // Add loading placeholder
                      const placeholderTr = view.state.tr;
                      placeholderTr.setMeta(imageUploadPlaceholderPluginKey, {
                        add: {
                          id: uploadId,
                          pos: currentPos,
                          width: displayWidth,
                          height: displayHeight,
                          type: 'video' as const,
                        },
                      });
                      view.dispatch(placeholderTr);

                      // Upload the video
                      const url = await onVideoUpload(video);

                      // Check for video node type
                      const { schema } = view.state;
                      const nodeType = schema.nodes.video;
                      if (!nodeType) {
                        console.error('No video node type found in schema');
                        // Remove placeholder on error
                        const removeTr = view.state.tr;
                        removeTr.setMeta(imageUploadPlaceholderPluginKey, {
                          remove: { id: uploadId },
                        });
                        view.dispatch(removeTr);
                        continue;
                      }

                      // Find the placeholder position (may have shifted)
                      const placeholder = findUploadPlaceholder(
                        view.state,
                        uploadId,
                        imageUploadPlaceholderPluginKey
                      );
                      const insertPos = placeholder?.pos ?? currentPos;

                      // Remove placeholder and insert actual video
                      const finalTr = view.state.tr;
                      finalTr.setMeta(imageUploadPlaceholderPluginKey, {
                        remove: { id: uploadId },
                      });

                      const node = nodeType.create({
                        src: url,
                      });

                      finalTr.insert(insertPos, node);
                      view.dispatch(finalTr);

                      // Update position for next insertion
                      currentPos = insertPos + node.nodeSize;
                    } catch (error) {
                      console.error('Failed to upload video:', error);
                      // Remove placeholder on error
                      const removeTr = view.state.tr;
                      removeTr.setMeta(imageUploadPlaceholderPluginKey, {
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

  // Configure the extension with the options
  // Using type assertion since these options exist at runtime but aren't in ImageResizeOptions type
  // Note: inline: false makes images block-level. Existing content with inline images
  // is auto-migrated via migrateInlineImagesToBlock() in the editor component.
  // Using mt-4 mb-2 for tighter vertical spacing - images have more space above than below
  // to maintain visual hierarchy without excessive gaps after the image.
  return baseExtension.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: {
      class: 'rounded-md mt-4 mb-2 block w-full',
    },
  } as Partial<ExtendedImageResizeOptions>);
};
