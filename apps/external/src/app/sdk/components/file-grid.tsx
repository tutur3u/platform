import { FileCard } from './file-card';
import { FileGridSkeleton } from './skeleton';

interface FileGridProps {
  files: any;
  isLoading: boolean;
  uploadPath: string;
  imageUrls: Record<string, string>;
  deletingFiles: Set<string>;
  onDownload: (filename: string, folderPath: string) => void;
  onDelete: (filename: string, folderPath: string) => void;
  onRefresh: () => void;
}

export function FileGrid({
  files,
  isLoading,
  uploadPath,
  imageUrls,
  deletingFiles,
  onDownload,
  onDelete,
  onRefresh,
}: FileGridProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-xl">
          {uploadPath || 'Root'} Folder ({files?.data.length || 0} files)
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="text-blue-600 text-sm hover:text-blue-700 disabled:opacity-50"
        >
          🔄 Refresh
        </button>
      </div>

      {isLoading ? (
        <FileGridSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {files?.data.map((file: any, idx: number) => {
            const filePath = uploadPath
              ? `${uploadPath}/${file.name}`
              : file.name;
            const isDeleting = deletingFiles.has(filePath);

            return (
              <FileCard
                key={idx}
                file={file}
                imageUrl={imageUrls[file.name]}
                uploadPath={uploadPath}
                isDeleting={isDeleting}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            );
          })}
          {(!files?.data || files.data.length === 0) && (
            <p className="col-span-full py-8 text-center text-gray-500 text-sm">
              No files in {uploadPath || 'root'} folder
            </p>
          )}
        </div>
      )}
    </div>
  );
}
