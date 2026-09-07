'use client';
import { Download, WifiOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}
export function PwaStatus() {
  const t = useTranslations('pwa');
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && navigator.standalone === true)
    );
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const install = async () => {
    if (!installPrompt) {
      setShowHelp(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch {
      setShowHelp(true);
    } finally {
      setInstallPrompt(null);
    }
  };
  return (
    <>
      {!online && (
        <div
          role="status"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-start gap-2 rounded-lg border bg-background p-3 text-sm shadow-lg"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>{t('offline_status')}</p>
        </div>
      )}
      {online && !installed && (
        <Button
          variant="outline"
          size="sm"
          className="fixed right-3 bottom-3 z-30 gap-2 rounded-full bg-background shadow-sm"
          onClick={() => void install()}
        >
          <Download className="size-4" />
          {t('install')}
        </Button>
      )}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('install')}</DialogTitle>
            <DialogDescription>{t('install_help')}</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">{t('cache_help')}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
