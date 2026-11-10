'use client';

import {
  pollWorkspaceNoteTransfer,
  recoverWorkspaceNoteKey,
  startWorkspaceNoteTransfer,
} from '@tuturuuu/internal-api/notes';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { QRCodeSVG } from 'qrcode.react';

export async function recoverNoteKeyWithPasskey(wsId: string, noteId: string) {
  const authClient = createAuthClient();
  const { data: owner } = await authClient.auth.getUser();
  const { data: previous } = await authClient.auth.getSession();
  const { data, error } = await authClient.auth.signInWithPasskey();
  if (error) throw error;
  if (!owner.user || data.user?.id !== owner.user.id) {
    let restoredOwner = false;
    if (previous.session && owner.user) {
      try {
        const restored = await authClient.auth.setSession({
          access_token: previous.session.access_token,
          refresh_token: previous.session.refresh_token,
        });
        restoredOwner =
          !restored.error && restored.data.user?.id === owner.user.id;
      } catch {
        // A rotated or revoked refresh token cannot restore the prior account.
      }
    }
    if (!restoredOwner) {
      await authClient.auth.signOut({ scope: 'local' });
    }
    throw new Error('Passkey account mismatch');
  }
  const { secret } = await recoverWorkspaceNoteKey(wsId, noteId);
  return secret;
}

export async function transferNoteKey({
  wsId,
  noteId,
  onQr,
  isCancelled,
}: {
  wsId: string;
  noteId: string;
  onQr: (value: string) => void;
  isCancelled: () => boolean;
}): Promise<string | null> {
  const id = crypto.randomUUID();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...keyBytes));
  await startWorkspaceNoteTransfer(wsId, noteId, id);
  if (isCancelled()) return null;
  const qr = new URL('tuturuuu://notes/transfer');
  qr.searchParams.set('wsId', wsId);
  qr.searchParams.set('noteId', noteId);
  qr.searchParams.set('id', id);
  qr.searchParams.set('key', key);
  qr.searchParams.set('origin', window.location.origin);
  onQr(qr.toString());
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['decrypt']
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (isCancelled()) return null;
    const { sealed } = await pollWorkspaceNoteTransfer(wsId, noteId, id);
    if (!sealed) continue;
    const bytes = Uint8Array.from(atob(sealed), (char) => char.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      cryptoKey,
      bytes.slice(12)
    );
    return new TextDecoder().decode(plaintext);
  }
  throw new Error('Transfer expired');
}

export function NoteTransferQr({
  value,
  description,
  cancelLabel,
  onCancel,
}: {
  value: string;
  description: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="rounded-2xl bg-white p-3">
        <QRCodeSVG value={value} size={192} />
      </div>
      <p>{description}</p>
      <Button variant="ghost" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </>
  );
}
