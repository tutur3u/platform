/**
 * Utility functions for SDK page
 */

export function isImageFile(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

export function formatBytes(bytes: number): string {
  return (bytes / 1024).toFixed(2);
}

export function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}
