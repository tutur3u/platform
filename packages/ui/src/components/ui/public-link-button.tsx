'use client';
import { safePublicContentLink } from '@tuturuuu/utils/public-content-link';
import { useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { Input } from './input';

type Props = {
  url: string | null;
  label: string;
  copiedLabel: string;
  errorLabel: string;
  manualCopyLabel: string;
};
export function PublicLinkButton(props: Props) {
  const url = safePublicContentLink(props.url);
  return url ? <CopyButton key={url} {...props} url={url} /> : null;
}
function CopyButton({
  url,
  label,
  copiedLabel,
  errorLabel,
  manualCopyLabel,
}: Props & { url: string }) {
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'copied' | 'failed'
  >('idle');
  const active = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={status === 'pending'}
        onClick={async () => {
          if (busy.current) return;
          busy.current = true;
          setStatus('pending');
          try {
            if (!navigator.clipboard?.writeText)
              throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(url);
            if (active.current) setStatus('copied');
          } catch {
            if (active.current) setStatus('failed');
          } finally {
            busy.current = false;
          }
        }}
      >
        {label}
      </Button>
      {status === 'copied' && (
        <p role="status" className="text-muted-foreground text-sm">
          {copiedLabel}
        </p>
      )}
      {status === 'failed' && (
        <>
          <p role="alert" className="text-sm">
            {errorLabel}
          </p>
          <label className="block space-y-1 text-sm">
            {manualCopyLabel}
            <Input
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
            />
          </label>
        </>
      )}
    </div>
  );
}
