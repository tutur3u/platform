import type { ChartBars } from '@tuturuuu/ui/chart-bars';
import type { ChartHeatmap } from '@tuturuuu/ui/chart-heatmap';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  type ComponentProps,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';

// Recharts is the largest dependency on the page, so the chart code is a
// separate chunk fetched only when a chart is about to scroll into view.
const Bars = lazy(() =>
  import('@tuturuuu/ui/chart-bars').then((m) => ({ default: m.ChartBars }))
);
const Heatmap = lazy(() =>
  import('@tuturuuu/ui/chart-heatmap').then((m) => ({
    default: m.ChartHeatmap,
  }))
);

/** True once the element is within `margin` of the viewport. */
function useNearViewport<T extends HTMLElement>(margin = 240) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: `${margin}px` }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

/**
 * A fixed-size slot for a chart: a skeleton until the chart is near the
 * viewport and its code has loaded, then the chart. The slot never changes
 * size, so nothing shifts.
 */
function ChartSlot({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const skeleton = <Skeleton className="size-full rounded-lg" />;
  return (
    <div ref={ref} className={className}>
      {near ? <Suspense fallback={skeleton}>{children}</Suspense> : skeleton}
    </div>
  );
}

export function LazyChartBars({
  slotClassName = 'h-64',
  ...props
}: ComponentProps<typeof ChartBars> & { slotClassName?: string }) {
  return (
    <ChartSlot className={slotClassName}>
      <Bars {...props} className="h-full" />
    </ChartSlot>
  );
}

export function LazyChartHeatmap({
  slotClassName = 'min-h-48',
  ...props
}: ComponentProps<typeof ChartHeatmap> & { slotClassName?: string }) {
  return (
    <ChartSlot className={slotClassName}>
      <Heatmap {...props} />
    </ChartSlot>
  );
}
