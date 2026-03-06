'use client';

import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import type { DateRangeConfig, HeatmapSize } from '../types';

function buildConfig(width: number) {
  const timezoneName = dayjs.tz.guess();
  const today = dayjs().tz(timezoneName);

  if (width < 640) {
    return {
      heatmapSize: { rectSize: 20, rectRadius: 1, gap: 2 },
      dateRangeConfig: {
        startDate: today
          .subtract(6, 'month')
          .startOf('month')
          .format('YYYY-MM-DD'),
        endDate: today.format('YYYY-MM-DD'),
        withOutsideDates: false,
      },
    };
  }

  if (width < 768) {
    return {
      heatmapSize: { rectSize: 12, rectRadius: 2, gap: 2 },
      dateRangeConfig: {
        startDate: today
          .subtract(6, 'month')
          .startOf('month')
          .format('YYYY-MM-DD'),
        endDate: today.format('YYYY-MM-DD'),
        withOutsideDates: false,
      },
    };
  }

  if (width < 1024) {
    return {
      heatmapSize: { rectSize: 12, rectRadius: 2, gap: 2.5 },
      dateRangeConfig: {
        startDate: today
          .subtract(9, 'month')
          .startOf('month')
          .format('YYYY-MM-DD'),
        endDate: today.format('YYYY-MM-DD'),
        withOutsideDates: false,
      },
    };
  }

  if (width < 1280) {
    return {
      heatmapSize: { rectSize: 14, rectRadius: 2, gap: 3 },
      dateRangeConfig: {
        startDate: today.subtract(364, 'day').format('YYYY-MM-DD'),
        endDate: today.format('YYYY-MM-DD'),
        withOutsideDates: true,
      },
    };
  }

  return {
    heatmapSize: { rectSize: 24, rectRadius: 3, gap: 3 },
    dateRangeConfig: {
      startDate: today.subtract(364, 'day').format('YYYY-MM-DD'),
      endDate: today.format('YYYY-MM-DD'),
      withOutsideDates: true,
    },
  };
}

export function useResponsiveHeatmapConfig() {
  const [heatmapSize, setHeatmapSize] = useState<HeatmapSize>({
    rectSize: 14,
    rectRadius: 2,
    gap: 3,
  });

  const [dateRangeConfig, setDateRangeConfig] = useState<DateRangeConfig>({
    startDate: dayjs().subtract(364, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
    withOutsideDates: true,
  });

  useEffect(() => {
    const updateSize = () => {
      const {
        heatmapSize: nextHeatmapSize,
        dateRangeConfig: nextDateRangeConfig,
      } = buildConfig(window.innerWidth);
      setHeatmapSize(nextHeatmapSize);
      setDateRangeConfig(nextDateRangeConfig);
    };

    updateSize();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateSize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  return { heatmapSize, dateRangeConfig };
}
