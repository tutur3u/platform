/**
 * API functions for SDK storage operations
 */

export async function fetchAnalytics() {
  const response = await fetch('/api/storage/analytics');
  if (!response.ok) throw new Error('Failed to fetch analytics');
  return response.json();
}

export async function fetchFiles(path?: string, limit = 50) {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  params.set('limit', limit.toString());

  const response = await fetch(`/api/storage/list?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch files');
  return response.json();
}

export async function deleteFiles(paths: string[]) {
  const response = await fetch('/api/storage/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Delete failed');
  }
  return response.json();
}

export async function uploadFile(
  file: File,
  path: string,
  onProgress?: (status: string) => void
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);
  formData.append('upsert', 'true');

  onProgress?.(`Uploading ${file.name}...`);

  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Upload failed');
  }

  return response.json();
}

export async function generateSignedUrl(path: string, expiresIn = 3600) {
  const response = await fetch('/api/storage/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, expiresIn }),
  });

  if (!response.ok) throw new Error('Failed to generate signed URL');
  return response.json();
}

export async function downloadFile(filename: string, folderPath: string) {
  const downloadPath = folderPath ? `${folderPath}/${filename}` : filename;
  const response = await fetch(`/api/storage/download/${downloadPath}`);

  if (!response.ok) throw new Error('Download failed');

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
