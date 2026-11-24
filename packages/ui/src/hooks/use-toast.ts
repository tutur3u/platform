'use client';

import type * as React from 'react';
import { toast as sonnerToast } from 'sonner';
import type { ToastActionElement, ToastProps } from '../components/ui/toast';

/**
 * Compatibility layer for the legacy Radix `useToast` API.
 *
 * Every app mounts the Sonner `<Toaster />` from `@tuturuuu/ui/sonner`, and
 * none mounts the Radix `<Toaster />`, so toasts sent through the old reducer
 * were never shown. This module keeps the old call shape and forwards each
 * toast to Sonner. New code should import `toast` from `@tuturuuu/ui/sonner`.
 */

type LegacyToast = Omit<ToastProps, 'title'> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type LegacyToastUpdate = Partial<LegacyToast> & { id?: string };

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return `legacy-toast-${count}`;
}

function show(
  id: string,
  { title, description, variant, action }: LegacyToast
) {
  // Sonner needs a message: use the description when there is no title.
  const message = title ?? description ?? '';
  const options = {
    id,
    description: title ? description : undefined,
    action,
  };

  if (variant === 'destructive') {
    sonnerToast.error(message, options);
  } else {
    sonnerToast(message, options);
  }
}

function toast(props: LegacyToast) {
  const id = genId();
  let current = props;
  show(id, current);

  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
    update: ({ id: _ignored, ...next }: LegacyToastUpdate) => {
      current = { ...current, ...next };
      show(id, current);
    },
  };
}

function dismiss(toastId?: string) {
  sonnerToast.dismiss(toastId);
}

/**
 * Sonner owns rendering and state, so `toasts` is always empty. The legacy
 * Radix `<Toaster />` therefore renders nothing, which keeps one toast stack.
 */
function useToast() {
  return {
    toasts: [] as Array<LegacyToast & { id: string }>,
    toast,
    dismiss,
  };
}

export { toast, useToast };
