import { TuturuuuClient } from 'tuturuuu';

const tuturuuu = new TuturuuuClient({
  apiKey: process.env.TUTURUUU_API_KEY || '',
  baseUrl: process.env.TUTURUUU_BASE_URL || '',
});

export default async function SDKPage() {
  try {
    // Get storage analytics
    const analytics = await tuturuuu.storage.getAnalytics();

    // List files at root
    const rootFiles = await tuturuuu.storage.list({
      limit: 50,
    });

    // List files in 'task-images' folder
    const taskImagesFiles = await tuturuuu.storage.list({
      path: 'task-images',
      limit: 50,
    });

    return (
      <div className="mx-auto max-w-6xl p-8 space-y-8">
        <div>
          <h1 className="mb-4 text-3xl font-bold">Tuturuuu SDK - Storage Example</h1>
          <p className="text-gray-600">
            Demonstrating the Tuturuuu SDK for workspace storage operations
          </p>
        </div>

        {/* Storage Analytics */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Storage Analytics</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-gray-600">Total Files</p>
              <p className="text-2xl font-bold">{analytics.data.fileCount}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm text-gray-600">Total Size</p>
              <p className="text-2xl font-bold">
                {(analytics.data.totalSize / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        </div>

        {/* Root Files */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Root Files ({rootFiles.data.length} items)
          </h2>
          <div className="space-y-2">
            {rootFiles.data.map((file, idx) => (
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
            {rootFiles.data.length === 0 && (
              <p className="text-gray-500 text-sm">No files at root level</p>
            )}
          </div>
        </div>

        {/* Task Images Files */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Task Images ({taskImagesFiles.data.length} files)
          </h2>
          <div className="space-y-2">
            {taskImagesFiles.data.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
              >
                <div className="flex-1">
                  <p className="font-medium">{file.name}</p>
                  {file.metadata?.mimetype && (
                    <p className="text-xs text-gray-500">{file.metadata.mimetype}</p>
                  )}
                </div>
                {file.metadata?.size && (
                  <span className="text-sm text-gray-600">
                    {(file.metadata.size / 1024).toFixed(2)} KB
                  </span>
                )}
              </div>
            ))}
            {taskImagesFiles.data.length === 0 && (
              <p className="text-gray-500 text-sm">No files in task-images folder</p>
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
  } catch (error) {
    console.error('Error fetching files:', error);

    return (
      <div className="mx-auto max-w-6xl p-8">
        <div className="rounded-lg bg-red-50 p-6 border border-red-200">
          <h1 className="mb-2 text-2xl font-bold text-red-900">SDK Error</h1>
          <p className="text-red-800 mb-4">
            Failed to connect to the Tuturuuu API. Please check your configuration.
          </p>
          <div className="rounded-lg bg-white p-4">
            <p className="font-semibold mb-2">Error Details:</p>
            <pre className="overflow-auto text-sm text-red-700">
              {error instanceof Error ? error.message : JSON.stringify(error, null, 2)}
            </pre>
          </div>
          <div className="mt-4 rounded-lg bg-white p-4">
            <p className="font-semibold mb-2">Configuration:</p>
            <ul className="text-sm space-y-1">
              <li>API Key: {process.env.TUTURUUU_API_KEY ? '✅ Set' : '❌ Missing'}</li>
              <li>Base URL: {process.env.TUTURUUU_BASE_URL || '❌ Missing'}</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
}
