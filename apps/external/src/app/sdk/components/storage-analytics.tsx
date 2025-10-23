import { formatMB } from '../lib/utils';
import { AnalyticsSkeleton } from './skeleton';

interface StorageAnalyticsProps {
  analytics: any;
  isLoading: boolean;
}

export function StorageAnalytics({
  analytics,
  isLoading,
}: StorageAnalyticsProps) {
  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  const usagePercentage = analytics?.data.usagePercentage || 0;
  const isAlmostFull = usagePercentage >= 90;
  const isHigh = usagePercentage >= 75 && usagePercentage < 90;

  return (
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
              {formatMB(analytics?.data.totalSize || 0)} MB
            </p>
          </div>
          <div className="rounded-lg bg-purple-50 p-4">
            <p className="text-gray-600 text-sm">Storage Limit</p>
            <p className="font-bold text-2xl">
              {formatMB(analytics?.data.storageLimit || 0)} MB
            </p>
          </div>
        </div>

        {/* Storage Usage Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Storage Usage</span>
            <span
              className={`font-semibold ${
                isAlmostFull
                  ? 'text-red-600'
                  : isHigh
                    ? 'text-yellow-600'
                    : 'text-green-600'
              }`}
            >
              {usagePercentage.toFixed(2)}%
            </span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full transition-all duration-500 ${
                isAlmostFull
                  ? 'bg-red-500'
                  : isHigh
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              }`}
              style={{
                width: `${Math.min(100, usagePercentage)}%`,
              }}
            />
          </div>
          {isAlmostFull && (
            <p className="font-medium text-red-600 text-sm">
              Warning: Storage almost full! Please delete some files to free up
              space.
            </p>
          )}
          {isHigh && (
            <p className="font-medium text-sm text-yellow-600">
              Caution: Storage usage is high. Consider cleaning up unused files.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
