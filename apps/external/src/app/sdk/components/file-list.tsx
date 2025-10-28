import { formatBytes } from '../lib/utils';
import { FileListSkeleton } from './skeleton';

interface FileListProps {
  files: any;
  isLoading: boolean;
  title: string;
}

export function FileList({ files, isLoading, title }: FileListProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-xl">{title}</h2>
        <FileListSkeleton />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-xl">
        {title} ({files?.data.length || 0} items)
      </h2>
      <div className="space-y-2">
        {files?.data.map((file: any, idx: number) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
          >
            <span className="font-medium">{file.name}</span>
            {file.metadata?.size && (
              <span className="text-gray-600 text-sm">
                {formatBytes(file.metadata.size)} KB
              </span>
            )}
          </div>
        ))}
        {(!files?.data || files.data.length === 0) && (
          <p className="text-gray-500 text-sm">No files at root level</p>
        )}
      </div>
    </div>
  );
}
