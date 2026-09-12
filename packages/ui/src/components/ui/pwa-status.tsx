'use client';
import { Download, WifiOff } from '@tuturuuu/icons';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearPwaInstallPrompt,
  getPwaInstallPrompt,
  initializePwaInstall,
  subscribePwaInstall,
} from '../../hooks/pwa-install-prompt';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}
export function PwaStatus({
  labels,
  placement = 'status',
}: {
  placement?: 'status' | 'settings';
  labels: {
    offline_status: string;
    install: string;
    install_help: string;
    cache_help: string;
    installed?: string;
  };
}) {
  const t = (key: keyof typeof labels) => labels[key];
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const installPrompt = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallPrompt,
    () => null
  );
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && navigator.standalone === true)
    );
    initializePwaInstall();
    const onInstalled = () => {
      setInstalled(true);
      clearPwaInstallPrompt();
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
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
      clearPwaInstallPrompt();
    }
  };
  return (
    <>
      {placement === 'status' && !online && (
        <div
          role="status"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-start gap-2 rounded-lg border bg-background p-3 text-sm shadow-lg"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>{t('offline_status')}</p>
        </div>
      )}
      {placement === 'settings' && online && !installed && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void install()}
        >
          <Download className="size-4" />
          {t('install')}
        </Button>
      )}
      {placement === 'settings' && installed && labels.installed && (
        <p role="status" className="text-muted-foreground text-sm">
          {labels.installed}
        </p>
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
