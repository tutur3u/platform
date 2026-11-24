import { UserRound } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { getPublicContentLink } from '@tuturuuu/utils/public-content-link';
import { publicProfileImage } from '@tuturuuu/utils/public-profile-url';
import type { ReactNode } from 'react';
import { PublicLinkButton } from '../public-link-button';

export type PublicProfileCardProfile = {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
};

export type PublicProfileCardLabels = {
  title: string;
  copyLink: string;
  linkCopied: string;
  copyFailed: string;
  manualCopyLink: string;
};

/**
 * The public Tuturuuu profile: banner, avatar, name, bio and share link. The
 * `/u/[username]` page and the settings dialog's Public profile tab both
 * render it, so the two always show the same projection.
 */
export function PublicProfileCard({
  profile,
  username,
  labels,
  headingLevel = 'h1',
  actions,
  className,
}: {
  profile: PublicProfileCardProfile;
  username: string;
  labels: PublicProfileCardLabels;
  headingLevel?: 'h1' | 'h2';
  actions?: ReactNode;
  className?: string;
}) {
  const avatar = publicProfileImage(profile.avatar_url);
  const banner = publicProfileImage(profile.banner_url);
  const Heading = headingLevel;
  return (
    <article
      className={cn('overflow-hidden rounded-2xl border bg-card', className)}
    >
      <div className="h-40 bg-muted sm:h-56">
        {banner && (
          <img
            src={banner}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <div className="relative space-y-5 px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-12 flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <UserRound
              className="size-10 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
        <Heading className="break-words font-semibold text-2xl sm:text-3xl">
          {profile.display_name || labels.title}
        </Heading>
        {profile.bio && (
          <p className="whitespace-pre-wrap break-words text-muted-foreground">
            {profile.bio}
          </p>
        )}
        <div className="flex flex-wrap items-start gap-2">
          <PublicLinkButton
            url={getPublicContentLink({ type: 'profile', username })}
            label={labels.copyLink}
            copiedLabel={labels.linkCopied}
            errorLabel={labels.copyFailed}
            manualCopyLabel={labels.manualCopyLink}
          />
          {actions}
        </div>
      </div>
    </article>
  );
}
