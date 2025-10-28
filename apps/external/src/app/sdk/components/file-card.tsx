import Image from 'next/image';
import { formatBytes, isImageFile } from '../lib/utils';

interface FileCardProps {
  file: any;
  imageUrl?: string;
  uploadPath: string;
  isDeleting: boolean;
  onDownload: (filename: string, folderPath: string) => void;
  onDelete: (filename: string, folderPath: string) => void;
  onFolderClick?: (folderName: string) => void;
}

export function FileCard({
  file,
  imageUrl,
  uploadPath,
  isDeleting,
  onDownload,
  onDelete,
  onFolderClick,
}: FileCardProps) {
  const isImage = isImageFile(file.name);
  // Folders typically don't have a mimetype in metadata
  const isFolder = !file.metadata?.mimetype;

  const handleCardClick = () => {
    if (isFolder && onFolderClick) {
      onFolderClick(file.name);
    }
  };

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md ${
        isFolder ? 'cursor-pointer' : ''
      }`}
      onClick={isFolder ? handleCardClick : undefined}
    >
      {isFolder ? (
        <div className="flex h-48 items-center justify-center bg-blue-50">
          <svg
            className="h-16 w-16 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Folder Icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </div>
      ) : isImage && imageUrl ? (
        <div className="relative h-48 w-full bg-gray-100">
          <Image
            src={imageUrl}
            alt={file.name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center bg-gray-100">
          <svg
            className="h-16 w-16 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>File Icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      <div className="p-3">
        <p className="truncate font-medium text-sm" title={file.name}>
          {file.name}
        </p>
        <div className="mt-1 flex items-center justify-between">
          {isFolder ? (
            <p className="text-gray-500 text-xs">Folder</p>
          ) : (
            <>
              {file.metadata?.mimetype && (
                <p className="text-gray-500 text-xs">
                  {file.metadata.mimetype}
                </p>
              )}
              {file.metadata?.size && (
                <span className="text-gray-600 text-xs">
                  {formatBytes(file.metadata.size)} KB
                </span>
              )}
            </>
          )}
        </div>
        {!isFolder && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onDownload(file.name, uploadPath)}
              disabled={isDeleting}
              className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => onDelete(file.name, uploadPath)}
              disabled={isDeleting}
              className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
