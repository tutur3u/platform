import type { WorkspaceStorageExportLinksResponse } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';

export function createLoaderManifest(
  data: WorkspaceStorageExportLinksResponse
) {
  return JSON.stringify(
    {
      folderName: data.folderName,
      folderPath: data.folderPath,
      generatedAt: data.generatedAt,
      mode: data.mode,
      entryUrl: data.loaderManifest.entryUrl,
      assetUrls: data.loaderManifest.assetUrls,
    },
    null,
    2
  );
}

export async function copyText(value: string, successMessage: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      return;
    }
  } catch {
    // Fall back to the textarea copy path below.
  }

  const fallback = document.createElement('textarea');
  fallback.value = value;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'fixed';
  fallback.style.opacity = '0';
  document.body.appendChild(fallback);
  fallback.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy failed');
    }

    toast.success(successMessage);
  } finally {
    document.body.removeChild(fallback);
  }
}
