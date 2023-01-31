import { useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  startNavigationProgress,
  completeNavigationProgress,
  NavigationProgress,
} from '@mantine/nprogress';

export function RouterTransition() {
  const router = useRouter();

  useEffect(() => {
    const handleStart = (url: string) => {
      // If the url is the same as the current one
      if (url === router.asPath) return;
      startNavigationProgress();
    };
    const handleComplete = () => completeNavigationProgress();

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [router.asPath, router.events]);

  return <NavigationProgress autoReset size={2} color="white" />;
}
