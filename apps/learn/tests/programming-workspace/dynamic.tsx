import { type ComponentType, lazy, type ReactNode, Suspense } from 'react';

export default function dynamic<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
  options: { loading?: () => ReactNode }
) {
  const Component = lazy(async () => ({ default: await load() }));
  return (props: Props) => (
    <Suspense fallback={options.loading?.()}>
      <Component {...props} />
    </Suspense>
  );
}
