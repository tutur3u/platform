interface ErrorDisplayProps {
  error: Error;
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
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
