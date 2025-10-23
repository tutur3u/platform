'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

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

  const isImageFile = (filename: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

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

  const loadImageUrls = async (files: any[], folderPath: string) => {
    const newUrls: Record<string, string> = {};

    for (const file of files) {
      if (isImageFile(file.name)) {
        try {
          const response = await fetch('/api/storage/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: `${folderPath}/${file.name}`,
              expiresIn: 3600
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
  };

  const loadData = async () => {
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
  };

  useEffect(() => {
    loadData();
  }, [uploadPath]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
      setUploadStatus(`❌ Failed to upload: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="text-gray-600">Loading storage data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <div className="rounded-lg bg-red-50 p-6 border border-red-200">
          <h1 className="mb-2 text-2xl font-bold text-red-900">API Error</h1>
          <p className="text-red-800 mb-4">
            Failed to connect to the storage API. Please check the server configuration.
          </p>
          <div className="rounded-lg bg-white p-4">
            <p className="font-semibold mb-2">Error Details:</p>
            <pre className="overflow-auto text-sm text-red-700">
              {error.message}
            </pre>
          </div>
          <div className="mt-4 rounded-lg bg-white p-4">
            <p className="font-semibold mb-2">Troubleshooting:</p>
            <ul className="text-sm space-y-1 list-disc ml-4">
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
    <div className="mx-auto max-w-6xl p-8 space-y-8">
      <div>
        <h1 className="mb-4 text-3xl font-bold">Tuturuuu SDK - Storage Example</h1>
        <p className="text-gray-600">
          Demonstrating the Tuturuuu SDK for workspace storage operations
        </p>
      </div>

      {/* Upload Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Upload Files</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="upload-path" className="text-sm font-medium text-gray-700">
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
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-xs text-gray-500">
            Files will be uploaded to: <span className="font-mono">{uploadPath || '(root)'}</span>
          </p>
          {uploadStatus && (
            <div className={`rounded-lg p-3 text-sm ${uploadStatus.startsWith('✅') ? 'bg-green-50 text-green-800' : uploadStatus.startsWith('❌') ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
              {uploadStatus}
            </div>
          )}
        </div>
      </div>

      {/* Storage Analytics */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Storage Analytics</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-gray-600">Total Files</p>
            <p className="text-2xl font-bold">{analytics?.data.fileCount || 0}</p>
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm text-gray-600">Total Size</p>
            <p className="text-2xl font-bold">
              {((analytics?.data.totalSize || 0) / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
      </div>

      {/* Root Files */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">
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
                <span className="text-sm text-gray-600">
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {uploadPath || 'Root'} Folder ({folderFiles?.data.length || 0} files)
          </h2>
          <button
            onClick={loadData}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
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
                className="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                {isImage && imageUrl ? (
                  <div className="relative w-full h-48 bg-gray-100">
                    <Image
                      src={imageUrl}
                      alt={file.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 bg-gray-100">
                    <svg
                      className="w-16 h-16 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
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
                  <p className="font-medium text-sm truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    {file.metadata?.mimetype && (
                      <p className="text-xs text-gray-500">{file.metadata.mimetype}</p>
                    )}
                    {file.metadata?.size && (
                      <span className="text-xs text-gray-600">
                        {(file.metadata.size / 1024).toFixed(2)} KB
                      </span>
                    )}
                  </div>
                  <button
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
            <p className="text-gray-500 text-sm col-span-full text-center py-8">
              No files in {uploadPath || 'root'} folder
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-green-50 p-4 border border-green-200">
        <p className="font-semibold text-green-900">✅ SDK Working!</p>
        <p className="text-sm text-green-800 mt-1">
          The Tuturuuu SDK successfully connected and retrieved your workspace files.
        </p>
      </div>
    </div>
  );
}
