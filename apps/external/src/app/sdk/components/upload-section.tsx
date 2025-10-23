interface UploadSectionProps {
  uploadPath: string;
  setUploadPath: (path: string) => void;
  isUploading: boolean;
  uploadStatus: string;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function UploadSection({
  uploadPath,
  setUploadPath,
  isUploading,
  uploadStatus,
  onFileUpload,
}: UploadSectionProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-xl">Upload Files</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="upload-path"
              className="font-medium text-gray-700 text-sm"
            >
              Folder:
            </label>
            <input
              id="upload-path"
              type="text"
              value={uploadPath}
              onChange={(e) => setUploadPath(e.target.value)}
              disabled={isUploading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              placeholder="e.g., gallery"
            />
          </div>
          <label
            htmlFor="file-upload"
            className={`cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 ${isUploading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {isUploading ? 'Uploading...' : 'Choose File'}
          </label>
          <input
            id="file-upload"
            type="file"
            onChange={onFileUpload}
            disabled={isUploading}
            className="hidden"
            accept="image/*,application/pdf,.txt,.md,.json"
          />
        </div>
        <p className="text-gray-500 text-xs">
          Files will be uploaded to:{' '}
          <span className="font-mono">{uploadPath || '(root)'}</span>
        </p>
        {uploadStatus && (
          <div
            className={`rounded-lg p-3 text-sm ${
              uploadStatus.startsWith('✅')
                ? 'bg-green-50 text-green-800'
                : uploadStatus.startsWith('❌')
                  ? 'bg-red-50 text-red-800'
                  : 'bg-blue-50 text-blue-800'
            }`}
          >
            {uploadStatus}
          </div>
        )}
      </div>
    </div>
  );
}
