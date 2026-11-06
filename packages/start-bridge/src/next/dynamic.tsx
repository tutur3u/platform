'use client';

import {
  type ComponentType,
  lazy,
  Suspense,
  useSyncExternalStore,
} from 'react';

const subscribe = () => () => {};

export default function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
  options?: { ssr?: boolean; loading?: ComponentType }
) {
  const Component = lazy(async () => {
    const module = await loader();
    return { default: 'default' in module ? module.default : module };
  });
  return function DeferredComponent(props: P) {
    const hydrated = useSyncExternalStore(
      subscribe,
      () => true,
      () => false
    );
    const Loading = options?.loading;
    const fallback = Loading ? <Loading /> : null;
    if (options?.ssr === false && !hydrated) return fallback;
    return (
      <Suspense fallback={fallback}>
        <Component {...props} />
      </Suspense>
    );
  };
}
