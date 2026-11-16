'use client';

import { createLogoutConfirmationUrl } from '@tuturuuu/utils/logout-target';

import { Button } from '@tuturuuu/ui/button';
import { TTR_URL } from '@/constants/common';

export default function LogButton() {
  const handleLogout = () => {
    window.location.assign(
      createLogoutConfirmationUrl({
        centralUrl: TTR_URL,
        appOrigin: window.location.origin,
        locale: document.documentElement.lang,
      })
    );
  };

  return (
    <Button variant="destructive" onClick={handleLogout}>
      Log out
    </Button>
  );
}
