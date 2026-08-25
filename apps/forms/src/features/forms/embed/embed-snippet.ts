import type { EmbedMode } from './protocol';

export interface EmbedSnippetOptions {
  baseUrl: string;
  shareCode: string;
  mode: EmbedMode;
  /** Fixed pixel height; omit to let inline embeds auto-size. */
  height?: number | null;
  /** Launcher label for the overlay modes. */
  launcherText?: string | null;
}

const OVERLAY_MODES: EmbedMode[] = ['popup', 'slider', 'popover', 'sidetab'];

export function isOverlayEmbedMode(mode: EmbedMode) {
  return OVERLAY_MODES.includes(mode);
}

/** Escapes a value for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds the copy-paste snippet for one embed mode.
 *
 * Emits only the attributes that differ from the SDK's defaults, so the snippet
 * stays short enough to read — a wall of redundant `data-*` attributes invites
 * people to edit the wrong one.
 */
export function buildEmbedSnippet({
  baseUrl,
  shareCode,
  mode,
  height,
  launcherText,
}: EmbedSnippetOptions) {
  const attributes = [
    `data-tuturuuu-form="${escapeAttribute(shareCode)}"`,
    `data-mode="${mode}"`,
  ];

  if (height && height > 0 && !isOverlayEmbedMode(mode)) {
    attributes.push(`data-height="${Math.round(height)}"`);
  }

  if (launcherText?.trim() && isOverlayEmbedMode(mode)) {
    attributes.push(
      `data-launcher-text="${escapeAttribute(launcherText.trim())}"`
    );
  }

  const container = `<div\n  ${attributes.join('\n  ')}\n></div>`;

  return `<script src="${baseUrl}/embed.js" async></script>\n${container}`;
}

/**
 * Plain iframe fallback for hosts that forbid third-party scripts — common in
 * locked-down CMSes. Loses auto-resize, so it takes an explicit height.
 */
export function buildIframeSnippet({
  baseUrl,
  shareCode,
  height,
}: Pick<EmbedSnippetOptions, 'baseUrl' | 'shareCode' | 'height'>) {
  const resolvedHeight = height && height > 0 ? Math.round(height) : 640;

  return [
    `<iframe src="${baseUrl}/embed/${encodeURIComponent(shareCode)}"`,
    `  title="Form"`,
    `  width="100%"`,
    `  height="${resolvedHeight}"`,
    `  style="border:0"`,
    `></iframe>`,
  ].join('\n');
}

/** Direct link to the hosted form — the simplest way to share it. */
export function buildShareUrl(baseUrl: string, shareCode: string) {
  return `${baseUrl}/f/${encodeURIComponent(shareCode)}`;
}
