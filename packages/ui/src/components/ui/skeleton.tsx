/**
 * Shared loading-skeleton kit. Prefer seeding real data (SSR or initial query
 * data) so no placeholder is needed; when one is, show a layout-matched
 * skeleton inside a `LoadingRegion` instead of visible loading copy.
 */
export {
  SkeletonCard,
  SkeletonList,
  SkeletonListRow,
  SkeletonSelectorTrigger,
  SkeletonSidebarItem,
  SkeletonTableRows,
} from './skeleton-layouts';
export type {
  LoadingRegionProps,
  SkeletonLineProps,
  SkeletonTextSize,
} from './skeleton-primitive';
export {
  FadeIn,
  LoadingRegion,
  Skeleton,
  SkeletonAvatar,
  SkeletonLine,
  SkeletonText,
  skeletonClassName,
} from './skeleton-primitive';
