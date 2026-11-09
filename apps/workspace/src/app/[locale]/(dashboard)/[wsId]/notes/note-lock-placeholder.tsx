'use client';

import { Lock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { NoteTransferQr } from './note-key-transfer';

export function NoteLockPlaceholder({
  deviceLocked,
  recovering,
  transferQr,
  recoveryError,
  labels,
  onPasskey,
  onPhone,
  onCancelTransfer,
  onPassphrase,
}: {
  deviceLocked: boolean;
  recovering: boolean;
  transferQr: string | null;
  recoveryError: boolean;
  labels: {
    devicePreview: string;
    lockedPreview: string;
    passkey: string;
    phone: string;
    scanQr: string;
    cancelTransfer: string;
    recoveryError: string;
    openLocked: string;
  };
  onPasskey: () => void;
  onPhone: () => void;
  onCancelTransfer: () => void;
  onPassphrase: () => void;
}) {
  return (
    <div className="flex min-h-96 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Lock className="size-6" />
      <p>{deviceLocked ? labels.devicePreview : labels.lockedPreview}</p>
      {deviceLocked ? (
        <>
          <Button variant="outline" disabled={recovering} onClick={onPasskey}>
            {labels.passkey}
          </Button>
          <Button variant="outline" disabled={!!transferQr} onClick={onPhone}>
            {labels.phone}
          </Button>
          {transferQr && (
            <NoteTransferQr
              value={transferQr}
              description={labels.scanQr}
              cancelLabel={labels.cancelTransfer}
              onCancel={onCancelTransfer}
            />
          )}
          {recoveryError && <p role="alert">{labels.recoveryError}</p>}
        </>
      ) : (
        <Button variant="outline" onClick={onPassphrase}>
          {labels.openLocked}
        </Button>
      )}
    </div>
  );
}
