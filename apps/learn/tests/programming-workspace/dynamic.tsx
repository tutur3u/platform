import { lazy, Suspense } from 'react';
export default function dynamic(load: any, options: any) {
  const Component = lazy(async () => ({ default: await load() }));
  return (props: any) => (
    <Suspense fallback={options.loading?.()}>
      <Component {...props} />
    </Suspense>
  );
}
