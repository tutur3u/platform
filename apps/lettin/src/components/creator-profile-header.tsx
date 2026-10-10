import { UserRound } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
export type CreatorIdentity = {
  id: string;
  display_name: string | null;
  bio: string | null;
  handle: string | null;
  avatar_url: string | null;
  banner_url: string | null;
};
const imageUrl = (value: string | null) => {
  try {
    return value && new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
};
export function CreatorProfileHeader({
  profile,
}: {
  profile: CreatorIdentity;
}) {
  const t = useTranslations('lettin');
  const banner = imageUrl(profile.banner_url);
  const avatar = imageUrl(profile.avatar_url);
  return (
    <section className="creator-identity">
      <div className="creator-identity-banner">
        {banner && (
          /* biome-ignore lint/performance/noImgElement: External creator artwork can be revoked. */ <img
            src={banner}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <div className="creator-identity-details">
        <div className="creator-identity-avatar">
          {avatar ? (
            /* biome-ignore lint/performance/noImgElement: The canonical avatar is an external URL. */ <img
              src={avatar}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <UserRound
              aria-hidden="true"
              className="creator-avatar-placeholder"
            />
          )}
        </div>
        <div>
          <h2>
            {profile.handle ? (
              <a
                href={`https://tuturuuu.com/u/${encodeURIComponent(profile.handle)}`}
              >
                {profile.display_name || t('creatorProfile')}
              </a>
            ) : (
              profile.display_name || t('creatorProfile')
            )}
          </h2>
          {profile.bio && <p className="creator-identity-bio">{profile.bio}</p>}
        </div>
      </div>
    </section>
  );
}
