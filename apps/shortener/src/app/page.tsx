import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect(
    process.env.NODE_ENV === 'development'
      ? getTuturuuuPortlessAppOrigin('platform')
      : 'https://tuturuuu.com'
  );
}
