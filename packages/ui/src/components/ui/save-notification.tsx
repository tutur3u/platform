'use client';

import type { ReactNode } from 'react';
import { toast } from './sonner';

interface SaveNotification {
  title: ReactNode;
  description?: ReactNode;
  variant?: 'default' | 'destructive';
  duration?: number;
}

/** Save feedback must use the Sonner toaster mounted by the application shells. */
export function notifySave({ title, variant, ...options }: SaveNotification) {
  const notify = variant === 'destructive' ? toast.error : toast.success;
  return notify(title, { ...options, closeButton: true });
}
