'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';

type Scope = {
  active: boolean;
  signature: string;
  actor: ReturnType<typeof useWorkspaceActor>;
  owner: Attempt | null;
};
type Attempt = { scope: Scope; element: HTMLDivElement; invoiceId: string };

function semanticSnapshot(value: unknown) {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );
}

export function useInvoicePngExport({
  wsId,
  invoice,
  renderInputs,
  isDarkPreview,
  ready,
  printableRef,
}: {
  wsId: string;
  invoice: { id: string; ws_id?: string };
  renderInputs: unknown;
  isDarkPreview: boolean;
  ready: boolean;
  printableRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations();
  const actor = useWorkspaceActor();
  const signature = semanticSnapshot([wsId, renderInputs]);
  const currentScope = useRef<Scope | null>(null);
  if (
    currentScope.current?.signature !== signature ||
    currentScope.current?.actor !== actor
  ) {
    if (currentScope.current) currentScope.current.active = false;
    currentScope.current = { active: true, signature, actor, owner: null };
  }
  const scope = currentScope.current;
  const [pending, setPending] = useState<Attempt | null>(null);
  useEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
    };
  }, [scope]);

  const handlePngExport = useCallback(async () => {
    const activeScope = () => {
      if (!scope.active || currentScope.current !== scope) return false;
      try {
        actor?.assertActive();
        return !!actor;
      } catch {
        return false;
      }
    };
    // A retained callback may never report a failure into a replacement scope.
    if (!scope.active || currentScope.current !== scope) return false;
    if (
      !actor?.actorId ||
      !wsId ||
      invoice.ws_id !== wsId ||
      !ready ||
      !printableRef.current
    ) {
      toast.error(t('common.export-error'));
      return false;
    }
    if (!activeScope() || scope.owner) return false;
    const attempt: Attempt = {
      scope,
      element: printableRef.current,
      invoiceId: invoice.id,
    };
    scope.owner = attempt;
    setPending(attempt);
    const current = () =>
      activeScope() &&
      scope.owner === attempt &&
      printableRef.current === attempt.element &&
      attempt.element.isConnected;
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      if (!current()) return false;
      const canvas = await html2canvas(attempt.element, {
        scale: 2,
        useCORS: true,
        backgroundColor: isDarkPreview ? '#1a1a1a' : '#ffffff',
        width: attempt.element.scrollWidth,
        height: attempt.element.scrollHeight,
      });
      if (!current()) return false;
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!current()) {
              resolve();
              return;
            }
            if (!blob) {
              reject(new Error('Failed to create image'));
              return;
            }
            try {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              try {
                link.href = url;
                const sanitizedId = attempt.invoiceId
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/đ/g, 'd')
                  .replace(/Đ/g, 'D')
                  .replace(/[^a-z0-9]/gi, '_')
                  .toLowerCase()
                  .replace(/_+/g, '_')
                  .replace(/^_|_$/g, '');
                link.download = `invoice-${sanitizedId}.png`;
                document.body.appendChild(link);
                link.click();
              } finally {
                link.remove();
                URL.revokeObjectURL(url);
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          'image/png',
          1.0
        );
      });
      if (!current()) return false;
      toast.success(t('common.export-success'));
      return true;
    } catch {
      if (!current()) return false;
      toast.error(t('common.export-error'));
      return true;
    } finally {
      if (current()) {
        scope.owner = null;
        setPending((value) => (value === attempt ? null : value));
      }
    }
  }, [
    actor,
    scope,
    wsId,
    invoice.id,
    invoice.ws_id,
    ready,
    printableRef,
    isDarkPreview,
    t,
  ]);
  return {
    handlePngExport,
    isExporting: pending?.scope === scope && scope.owner === pending,
  };
}
