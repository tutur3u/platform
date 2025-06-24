export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  let i = Math.floor(Math.log(bytes) / Math.log(k));

  if (bytes < 1) {
    return '0 Bytes';
  } else if (bytes < k) {
    i = 1;
  }

  const value = bytes / k ** i;
  const unit = sizes[i];

  return `${parseFloat(value.toFixed(dm))} ${unit}`;
}
