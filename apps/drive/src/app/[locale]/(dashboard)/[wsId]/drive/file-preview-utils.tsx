import { FileText, Image as ImageIcon, Music, Video } from '@tuturuuu/icons';

export type DrivePreviewFileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'code'
  | 'other';

const imageExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
];
const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
const textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log'];
const codeExtensions = [
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'java',
  'c',
  'cpp',
  'css',
  'html',
  'php',
];

export function getFileType(fileName: string): DrivePreviewFileType {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  if (imageExtensions.includes(extension)) return 'image';
  if (videoExtensions.includes(extension)) return 'video';
  if (audioExtensions.includes(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  if (textExtensions.includes(extension)) return 'text';
  if (codeExtensions.includes(extension)) return 'code';

  return 'other';
}

export function getFileIcon(fileType: string) {
  switch (fileType) {
    case 'image':
      return <ImageIcon className="h-5 w-5" />;
    case 'video':
      return <Video className="h-5 w-5" />;
    case 'audio':
      return <Music className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}
