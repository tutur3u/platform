import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function LogoutButton() {
  const t = useTranslations('common');
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
    });
    router.refresh();
  };

  return (
    <Button
      onClick={logout}
      variant="destructive"
      className="font-semibold text-red-300 hover:text-red-200"
    >
      {t('logout')}
    </Button>
  );
}
