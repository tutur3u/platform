import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import { BASE_URL, DEV_MODE } from '@/constants/common';
import { LoginContent, type LoginDomain } from './login-content';

const DOMAINS = {
  TUTURUUU: {
    name: 'Tuturuuu',
    href: BASE_URL,
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  CHAT: {
    name: 'Chat',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('chat')
      : 'https://chat.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  NOVA: {
    name: 'Nova',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('nova')
      : 'https://nova.ai.vn',
    logo: '/media/logos/nova/nova-transparent.png',
  },
  LEARN: {
    name: 'Learn',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('learn')
      : 'https://learn.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  TEACH: {
    name: 'Teach',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('teach')
      : 'https://teach.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  INVENTORY: {
    name: 'Inventory',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('inventory')
      : 'https://inventory.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
} as const satisfies Record<string, LoginDomain>;

type LoginSearchParams = {
  [key: string]: string | string[] | undefined;
};

interface LoginProps {
  searchParams: Promise<LoginSearchParams>;
}

const getSingleSearchParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.at(0) : value;

const getReturnUrlDomain = (url: string | undefined) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Ensure the URL uses http or https protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }
    return urlObj.host;
  } catch {
    return null;
  }
};

export default async function Login({ searchParams }: LoginProps) {
  const params = await searchParams;
  const returnUrl = getSingleSearchParam(params.returnUrl);
  const multiAccount = getSingleSearchParam(params.multiAccount) === 'true';

  const returnUrlDomain = getReturnUrlDomain(returnUrl);

  const currentDomain = returnUrlDomain
    ? Object.values(DOMAINS).find((domain) =>
        domain.href.includes(returnUrlDomain)
      )
    : DOMAINS.TUTURUUU;

  return (
    <LoginContent
      currentDomain={currentDomain ?? null}
      multiAccount={multiAccount}
      tuturuuuDomain={DOMAINS.TUTURUUU}
    />
  );
}
