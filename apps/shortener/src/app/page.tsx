import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect(
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:7803'
      : 'https://tuturuuu.com'
  );
}
