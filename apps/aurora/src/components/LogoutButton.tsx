import { Button } from '@repo/ui/components/ui/button';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

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
