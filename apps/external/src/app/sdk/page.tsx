'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

export default function SDKPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [rootFiles, setRootFiles] = useState<any>(null);
  const [folderFiles, setFolderFiles] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [uploadPath, setUploadPath] = useState<string>('gallery');

  const isImageFile = useCallback((filename: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }, []);

  const handleDownload = async (filename: string, folderPath: string) => {
    try {
      const downloadPath = folderPath ? `${folderPath}/${filename}` : filename;
      const response = await fetch(`/api/storage/download/${downloadPath}`);

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const loadImageUrls = useCallback(
    async (files: any[], folderPath: string) => {
      const newUrls: Record<string, string> = {};

      for (const file of files) {
        if (isImageFile(file.name)) {
          try {
            const response = await fetch('/api/storage/share', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: `${folderPath}/${file.name}`,
                expiresIn: 3600,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              newUrls[file.name] = result.data.signedUrl;
            }
          } catch (err) {
            console.error(`Failed to load image URL for ${file.name}:`, err);
          }
        }
      }

      setImageUrls(newUrls);
    },
    [isImageFile]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, rootRes, folderRes] = await Promise.all([
        fetch('/api/storage/analytics'),
        fetch('/api/storage/list?limit=50'),
        fetch(`/api/storage/list?path=${uploadPath}&limit=50`),
      ]);

      if (!analyticsRes.ok || !rootRes.ok || !folderRes.ok) {
        throw new Error('Failed to fetch data from API');
      }

      const [analyticsData, rootData, folderData] = await Promise.all([
        analyticsRes.json(),
        rootRes.json(),
        folderRes.json(),
      ]);

      setAnalytics(analyticsData);
      setRootFiles(rootData);
      setFolderFiles(folderData);

      // Load image URLs for the selected folder
      if (folderData?.data) {
        loadImageUrls(folderData.data, uploadPath);
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [uploadPath, loadImageUrls]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check storage limit before uploading
    if (analytics?.data) {
      const { totalSize, storageLimit } = analytics.data;
      const remainingSpace = storageLimit - totalSize;

      if (file.size > remainingSpace) {
        const remainingMB = (remainingSpace / 1024 / 1024).toFixed(2);
        const fileMB = (file.size / 1024 / 1024).toFixed(2);
        setUploadStatus(
          `❌ Storage limit exceeded: File size (${fileMB} MB) exceeds available space (${remainingMB} MB)`
        );
        setTimeout(() => setUploadStatus(''), 5000);
        event.target.value = '';
        return;
      }
    }

    setIsUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', uploadPath);
      formData.append('upsert', 'true');

      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      setUploadStatus(`✅ Successfully uploaded ${file.name}`);

      // Reload data after successful upload
      setTimeout(() => {
        loadData();
        setUploadStatus('');
      }, 2000);
    } catch (err) {
      setUploadStatus(
        `❌ Failed to upload: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setTimeout(() => setUploadStatus(''), 5000);
    } finally {
      setIsUploading(false);
      // Reset input
      event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-r-transparent border-solid"></div>
            <p className="text-gray-600">Loading storage data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="mb-2 font-bold text-2xl text-red-900">API Error</h1>
          <p className="mb-4 text-red-800">
            Failed to connect to the storage API. Please check the server
            configuration.
          </p>
          <div className="rounded-lg bg-white p-4">
            <p className="mb-2 font-semibold">Error Details:</p>
            <pre className="overflow-auto text-red-700 text-sm">
              {error.message}
            </pre>
          </div>
          <div className="mt-4 rounded-lg bg-white p-4">
            <p className="mb-2 font-semibold">Troubleshooting:</p>
            <ul className="ml-4 list-disc space-y-1 text-sm">
              <li>Ensure the server has TUTURUUU_API_KEY set in .env.local</li>
              <li>Ensure the server has TUTURUUU_BASE_URL set in .env.local</li>
              <li>Check that the API endpoints are accessible</li>
              <li>Verify the API key has the required permissions</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div>
        <h1 className="mb-4 font-bold text-3xl">
          Tuturuuu SDK - Storage Example
        </h1>
        <p className="text-gray-600">
          Demonstrating the Tuturuuu SDK for workspace storage operations
        </p>
      </div>

      {/* Upload Section */}
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
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Choose File'}
            </label>
            <input
              id="file-upload"
              type="file"
              onChange={handleFileUpload}
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
              className={`rounded-lg p-3 text-sm ${uploadStatus.startsWith('✅') ? 'bg-green-50 text-green-800' : uploadStatus.startsWith('❌') ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}
            >
              {uploadStatus}
            </div>
          )}
        </div>
      </div>

      {/* Storage Analytics */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-xl">Storage Analytics</h2>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-gray-600 text-sm">Total Files</p>
              <p className="font-bold text-2xl">
                {analytics?.data.fileCount || 0}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-gray-600 text-sm">Total Size</p>
              <p className="font-bold text-2xl">
                {((analytics?.data.totalSize || 0) / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <p className="text-gray-600 text-sm">Storage Limit</p>
              <p className="font-bold text-2xl">
                {((analytics?.data.storageLimit || 0) / 1024 / 1024).toFixed(2)}{' '}
                MB
              </p>
            </div>
          </div>

          {/* Storage Usage Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Storage Usage</span>
              <span
                className={`font-semibold ${
                  (analytics?.data.usagePercentage || 0) >= 90
                    ? 'text-red-600'
                    : (analytics?.data.usagePercentage || 0) >= 75
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`}
              >
                {(analytics?.data.usagePercentage || 0).toFixed(2)}%
              </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full transition-all duration-500 ${
                  (analytics?.data.usagePercentage || 0) >= 90
                    ? 'bg-red-500'
                    : (analytics?.data.usagePercentage || 0) >= 75
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{
                  width: `${Math.min(100, analytics?.data.usagePercentage || 0)}%`,
                }}
              />
            </div>
            {(analytics?.data.usagePercentage || 0) >= 90 && (
              <p className="font-medium text-red-600 text-sm">
                Warning: Storage almost full! Please delete some files to free
                up space.
              </p>
            )}
            {(analytics?.data.usagePercentage || 0) >= 75 &&
              (analytics?.data.usagePercentage || 0) < 90 && (
                <p className="font-medium text-sm text-yellow-600">
                  Caution: Storage usage is high. Consider cleaning up unused
                  files.
                </p>
              )}
          </div>
        </div>
      </div>

      {/* Root Files */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-xl">
          Root Files ({rootFiles?.data.length || 0} items)
        </h2>
        <div className="space-y-2">
          {rootFiles?.data.map((file: any, idx: number) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
            >
              <span className="font-medium">{file.name}</span>
              {file.metadata?.size && (
                <span className="text-gray-600 text-sm">
                  {(file.metadata.size / 1024).toFixed(2)} KB
                </span>
              )}
            </div>
          ))}
          {(!rootFiles?.data || rootFiles.data.length === 0) && (
            <p className="text-gray-500 text-sm">No files at root level</p>
          )}
        </div>
      </div>

      {/* Folder Files */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-xl">
            {uploadPath || 'Root'} Folder ({folderFiles?.data.length || 0}{' '}
            files)
          </h2>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="text-blue-600 text-sm hover:text-blue-700 disabled:opacity-50"
          >
            🔄 Refresh
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {folderFiles?.data.map((file: any, idx: number) => {
            const isImage = isImageFile(file.name);
            const imageUrl = imageUrls[file.name];

            return (
              <div
                key={idx}
                className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                {isImage && imageUrl ? (
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
                    {file.metadata?.mimetype && (
                      <p className="text-gray-500 text-xs">
                        {file.metadata.mimetype}
                      </p>
                    )}
                    {file.metadata?.size && (
                      <span className="text-gray-600 text-xs">
                        {(file.metadata.size / 1024).toFixed(2)} KB
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(file.name, uploadPath)}
                    className="mt-2 w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  >
                    Download
                  </button>
                </div>
              </div>
            );
          })}
          {(!folderFiles?.data || folderFiles.data.length === 0) && (
            <p className="col-span-full py-8 text-center text-gray-500 text-sm">
              No files in {uploadPath || 'root'} folder
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-semibold text-green-900">✅ SDK Working!</p>
        <p className="mt-1 text-green-800 text-sm">
          The Tuturuuu SDK successfully connected and retrieved your workspace
          files.
        </p>
      </div>
    </div>
  );
}
