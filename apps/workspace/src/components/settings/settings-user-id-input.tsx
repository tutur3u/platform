'use client';

import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { Input } from '@tuturuuu/ui/input';

interface Props {
  userId: string;
}

export default function UserIdInput({ userId }: Props) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  return (
    <div className="flex w-full items-center gap-2">
      <Input id="user-id" value={userId} disabled />

      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => copyToClipboard(userId)}
        className="shrink-0"
      >
        {isCopied ? (
          <Check className="h-5 w-5" />
        ) : (
          <Copy className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
