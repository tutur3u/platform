'use client';

import { Button } from '@tuturuuu/ui/button';
import { Loader2 } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

export default function AuroraActions() {
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);

  const handleHealthCheck = async () => {
    setIsHealthLoading(true);
    try {
      const res = await fetch('/api/v1/aurora/health', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to check Aurora health');
      }

      toast.success('Aurora health check successful');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to check Aurora health'
      );
    } finally {
      setIsHealthLoading(false);
    }
  };

  const handleForecastUpdate = async () => {
    setIsForecastLoading(true);
    try {
      const res = await fetch('/api/v1/aurora/forecast', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update Aurora forecast');
      }

      toast.success('Aurora forecast updated successfully');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update Aurora forecast'
      );
    } finally {
      setIsForecastLoading(false);
    }
  };

  const handleMetricsUpdate = async () => {
    setIsMetricsLoading(true);
    try {
      const [mlRes, statRes] = await Promise.all([
        fetch('/api/v1/aurora/ml-metrics', {
          method: 'POST',
        }),
        fetch('/api/v1/aurora/statistical-metrics', {
          method: 'POST',
        }),
      ]);

      if (!mlRes.ok || !statRes.ok) {
        const [mlData, statData] = await Promise.all([
          mlRes.json(),
          statRes.json(),
        ]);
        throw new Error(
          mlData.message ||
            statData.message ||
            'Failed to update Aurora metrics'
        );
      }

      toast.success('Aurora metrics updated successfully');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update Aurora metrics'
      );
    } finally {
      setIsMetricsLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={handleHealthCheck}
        variant="outline"
        disabled={isHealthLoading}
      >
        {isHealthLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Checking Health...
          </>
        ) : (
          'Check Aurora Health'
        )}
      </Button>

      <Button
        onClick={handleForecastUpdate}
        variant="outline"
        disabled={isForecastLoading}
      >
        {isForecastLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating Forecast...
          </>
        ) : (
          'Update Aurora Forecast'
        )}
      </Button>

      <Button
        onClick={handleMetricsUpdate}
        variant="outline"
        disabled={isMetricsLoading}
      >
        {isMetricsLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating Metrics...
          </>
        ) : (
          'Update Aurora Metrics'
        )}
      </Button>
    </div>
  );
}
