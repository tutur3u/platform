'use client';

import { getInitials } from '@tuturuuu/utils/name-helper';
import { useState } from 'react';

interface UserAvatarCellProps {
  /** Already-normalized avatar URL, or null/undefined when none is set. */
  avatarUrl?: string | null;
  name: string;
}

/**
 * Square avatar used in the users table identity cell. Renders the avatar
 * image when available and falls back to the initials placeholder both when no
 * URL is set and when the image fails to load (broken / 404 links).
 */
export function UserAvatarCell({ avatarUrl, name }: UserAvatarCellProps) {
  const [errored, setErrored] = useState(false);
  // Reset the error flag during render when the row is recycled with a
  // different avatar (table rows are reused across pages / refetches).
  const [lastUrl, setLastUrl] = useState(avatarUrl);
  if (avatarUrl !== lastUrl) {
    setLastUrl(avatarUrl);
    setErrored(false);
  }

  const showImage = !!avatarUrl && !errored;

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-foreground/5 font-semibold text-foreground/60 text-xs">
      {showImage ? (
        // biome-ignore lint/performance/noImgElement: Supabase public avatars are served directly to avoid Next image proxy failures.
        <img
          src={avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
