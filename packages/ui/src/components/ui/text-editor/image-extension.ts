import type { EditorView } from '@tiptap/pm/view';
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

interface ImageOptions {
  onImageUpload?: (file: File) => Promise<string>;
}

export const CustomImage = (options: ImageOptions = {}) => {
  const baseExtension = ImageResize.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const width = element.getAttribute('width');
            return width ? Number.parseInt(width, 10) : null;
          },
          renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.width) {
              return {};
            }
            return {
              width: attributes.width,
            };
          },
        },
        'data-snapped': {
          default: 'false',
          parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-snapped') || 'false',
          renderHTML: (attributes: Record<string, unknown>) => ({
            'data-snapped': attributes['data-snapped'],
          }),
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

          view() {
            return {
              update: (view: EditorView) => {
                // Find all image nodes (check both imageResize and image for compatibility)
                view.state.doc.descendants((node, pos) => {
                  if (
                    node.type.name !== 'imageResize' &&
                    node.type.name !== 'image'
                  )
                    return;

                  // Skip if already snapped in this cycle
                  if (node.attrs['data-snapped'] === 'true') return;

                  const width = node.attrs.width as number | null;
                  if (!width) return;

                  // Get the editor's content width
                  const editorElement = view.dom as HTMLElement;
                  const containerWidth =
                    editorElement.querySelector('.ProseMirror')?.clientWidth ||
                    editorElement.clientWidth ||
                    800;

                  // Snap to nearest preset
                  const snappedWidth = snapToNearestSize(width, containerWidth);

                  // Only update if different
                  if (Math.abs(width - snappedWidth) > 5) {
                    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      width: snappedWidth,
                      'data-snapped': 'true',
                    });

                    // Dispatch after a short delay to avoid conflicts
                    setTimeout(() => {
                      if (view.state) {
                        view.dispatch(tr);
                      }
                    }, 100);
                  }
                });
              },
            };
          },
        }),
        // Image drop plugin with upload
        new Plugin({
          key: new PluginKey('imageDropPlugin'),

          props: {
            handleDOMEvents: {
              drop: (view: EditorView, event: Event) => {
                const dragEvent = event as DragEvent;
                if (!onImageUpload) return false;

                const { schema } = view.state;
                const hasFiles = dragEvent.dataTransfer?.files?.length;

                if (!hasFiles) return false;

                const images = Array.from(
                  dragEvent.dataTransfer?.files || []
                ).filter((file) => /image/i.test(file.type));

                if (images.length === 0) return false;

                dragEvent.preventDefault();

                const coordinates = view.posAtCoords({
                  left: dragEvent.clientX,
                  top: dragEvent.clientY,
                });

                if (!coordinates || typeof coordinates.pos !== 'number') {
                  return true;
                }

                const initialPos = coordinates.pos;

                // Get container width for default size
                const editorElement = view.dom as HTMLElement;
                const containerWidth =
                  editorElement.querySelector('.ProseMirror')?.clientWidth ||
                  editorElement.clientWidth ||
                  800;
                const defaultWidth =
                  (SIZE_PERCENTAGES.md / 100) * containerWidth;

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

                      // Upload the image
                      const url = await onImageUpload(image);

                      // Try imageResize first (custom), fallback to image (base)
                      const nodeType =
                        schema.nodes.imageResize || schema.nodes.image;
                      if (!nodeType) {
                        console.error('No image node type found in schema');
                        continue;
                      }

                      const node = nodeType.create({
                        src: url,
                        width: defaultWidth,
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
    inline: false,
    allowBase64: false,
    HTMLAttributes: {
      class: 'rounded-md my-4',
    },
  });
};
