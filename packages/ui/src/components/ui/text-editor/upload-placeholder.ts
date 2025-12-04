import type { EditorState } from 'prosemirror-state';
import { PluginKey } from 'prosemirror-state';

// Plugin keys for upload placeholder decorations (separate keys to avoid conflicts)
export const imageUploadPlaceholderPluginKey = new PluginKey(
  'imageUploadPlaceholder'
);
export const videoUploadPlaceholderPluginKey = new PluginKey(
  'videoUploadPlaceholder'
);

// Generate unique ID for each upload
let uploadIdCounter = 0;
export function generateUploadId(): string {
  return `upload-${Date.now()}-${++uploadIdCounter}`;
}

/**
 * Create a loading placeholder element for uploading media (images/videos)
 */
export function createLoadingPlaceholder(
  width: number,
  height: number,
  type: 'image' | 'video' = 'image'
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

  // Spinning loader - using Tailwind classes for theme consistency
  const spinner = document.createElement('div');
  spinner.className =
    'w-8 h-8 border-[3px] border-muted-foreground/30 border-t-muted-foreground rounded-full';
  spinner.style.animation = 'spin 0.8s linear infinite';

  // Add keyframes for spin animation if not already present (skip in SSR/test environments)
  if (typeof document !== 'undefined' && document.head) {
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
  }

  // Upload text
  const text = document.createElement('span');
  text.className = 'text-xs text-muted-foreground font-medium';
  text.textContent =
    type === 'video' ? 'Uploading video...' : 'Uploading image...';

  spinnerContainer.appendChild(spinner);
  spinnerContainer.appendChild(text);
  placeholder.appendChild(spinnerContainer);
  wrapper.appendChild(placeholder);

  return wrapper;
}

/**
 * Find placeholder decoration by upload ID
 */
export function findUploadPlaceholder(
  state: EditorState,
  id: string,
  pluginKey: PluginKey
): { pos: number; spec: { id: string } } | null {
  const decorations = pluginKey.getState(state);
  if (!decorations) return null;

  let found: { pos: number; spec: { id: string } } | null = null;

  // Iterate through all decorations to find the one with matching ID
  const allDecos = decorations.find();
  for (const deco of allDecos) {
    const spec = (deco as any).spec;
    if (spec?.id === id) {
      found = { pos: deco.from, spec };
      break;
    }
  }

  return found;
}
