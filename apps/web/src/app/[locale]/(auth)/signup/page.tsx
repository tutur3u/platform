import { redirect } from 'next/navigation';

interface SignupPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Keep old signup links working while the unified login form handles both
 * account creation and sign-in.
 */
export default async function SignupPage({
  params,
  searchParams,
}: SignupPageProps) {
  const { locale } = await params;
  const queryParams = await searchParams;
  const loginParams = new URLSearchParams();

  for (const [key, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) {
      for (const item of value) loginParams.append(key, item);
    } else if (value !== undefined) {
      loginParams.set(key, value);
    }
  }

  const query = loginParams.toString();
  const loginPath = locale === 'en' ? '/login' : `/${locale}/login`;
  redirect(query ? `${loginPath}?${query}` : loginPath);
}
