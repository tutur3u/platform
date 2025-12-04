import { Plugin, PluginKey } from 'prosemirror-state';
import ImageResize from 'tiptap-extension-resize-image';

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

/**
 * Load an image file and get its natural dimensions
 */
function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

interface ImageOptions {
  onImageUpload?: (file: File) => Promise<string>;
}

export const CustomImage = (options: ImageOptions = {}) => {
  const baseExtension = ImageResize.extend({
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

    addProseMirrorPlugins() {
      const parentPlugins = this.parent?.() || [];
      const { onImageUpload } = options;

      return [
        ...parentPlugins,
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
        // Image paste plugin with upload
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
                    try {
                      console.log('Processing pasted image:', {
                        name: image.name,
                        type: image.type,
                        size: image.size,
                      });

                      // Validate file size (max 5MB for images)
                      const maxSize = 5 * 1024 * 1024;
                      if (image.size > maxSize) {
                        console.error(
                          'Image size must be less than 5MB:',
                          image.name
                        );
                        continue;
                      }

                      // Get image natural dimensions before upload
                      const dimensions = await getImageDimensions(image);

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
                        continue;
                      }

                      // Calculate width using preset-aligned sizing
                      // This prevents the image from snapping when first clicked
                      const width = calculatePresetWidth(
                        dimensions.width,
                        containerWidth
                      );

                      // Create and insert the image node
                      const node = imageNode.create({
                        src: url,
                        width: width,
                      });

                      const tr = view.state.tr.insert(currentPos, node);
                      view.dispatch(tr);

                      // Update position for next insertion, mapping through the transaction
                      currentPos = tr.mapping.map(currentPos) + node.nodeSize;
                    } catch (error) {
                      console.error(
                        'Failed to upload pasted image:',
                        image.name,
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

        // Image drop plugin with upload
        new Plugin({
          key: new PluginKey('imageDropPlugin'),

          props: {
            handleDOMEvents: {
              drop: (view, event: DragEvent) => {
                if (!onImageUpload) return false;

                const { schema } = view.state;
                const hasFiles = event.dataTransfer?.files?.length;

                if (!hasFiles) return false;

                const images = Array.from(
                  event.dataTransfer?.files || []
                ).filter((file) => /image/i.test(file.type));

                if (images.length === 0) return false;

                event.preventDefault();

                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });

                if (!coordinates || typeof coordinates.pos !== 'number') {
                  return true;
                }

                const initialPos = coordinates.pos;

                // Get container width for sizing calculations
                const editorElement = view.dom as HTMLElement;
                const containerWidth =
                  editorElement.querySelector('.ProseMirror')?.clientWidth ||
                  editorElement.clientWidth ||
                  800;

                // Process files sequentially to avoid transaction conflicts
                (async () => {
                  let currentPos = initialPos;
                  for (const image of images) {
                    try {
                      // Validate file size (max 5MB)
                      const maxSize = 5 * 1024 * 1024;
                      if (image.size > maxSize) {
                        console.error('Image too large:', image.name);
                        continue;
                      }

                      // Get image natural dimensions before upload
                      const dimensions = await getImageDimensions(image);

                      // Upload the image
                      const url = await onImageUpload(image);

                      // Try imageResize first (custom), fallback to image (base)
                      const nodeType =
                        schema.nodes.imageResize || schema.nodes.image;
                      if (!nodeType) {
                        console.error('No image node type found in schema');
                        continue;
                      }

                      // Calculate width using preset-aligned sizing
                      // This prevents the image from snapping when first clicked
                      const width = calculatePresetWidth(
                        dimensions.width,
                        containerWidth
                      );

                      const node = nodeType.create({
                        src: url,
                        width: width,
                      });

                      // Create fresh transaction from current view state
                      const tr = view.state.tr.insert(currentPos, node);
                      view.dispatch(tr);

                      // Update position for next insertion
                      currentPos = tr.mapping.map(currentPos) + node.nodeSize;
                    } catch (error) {
                      console.error('Failed to upload image:', error);
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

  return baseExtension.configure({
    inline: true, // Make images block-level to prevent text wrapping
    allowBase64: false,
    HTMLAttributes: {
      class: 'rounded-md my-4 block w-full',
    },
  });
};
