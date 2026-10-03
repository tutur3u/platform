'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  getCurrentUserProfile,
  updateCurrentUserProfile,
} from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { isValidNewUsername } from '@tuturuuu/utils/username-policy';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { CreatorAboutEditor } from './creator-about-editor';
import { CreatorProfileHeader } from './creator-profile-header';
import { useNavigationGuard } from './navigation-guard';
import { ProfileMediaField } from './profile-media-field';
export function CreatorProfileEditor({
  hasPublishedWorlds,
  wsId,
  canEditAbout,
}: {
  wsId: string;
  canEditAbout: boolean;
  hasPublishedWorlds: boolean;
}) {
  const t = useTranslations('lettin');
  const { dirty } = useNavigationGuard();
  const [tab, setTab] = useState<'identity' | 'about'>('identity');
  const query = useQuery({
    queryKey: ['lettin-profile'],
    queryFn: () => getCurrentUserProfile(),
  });
  if (query.isPending)
    return (
      <p role="status" className="p-10">
        {t('loading')}
      </p>
    );
  if (!query.data)
    return (
      <div role="alert" className="p-10">
        {t('requestFailed')}{' '}
        <Button onClick={() => query.refetch()}>{t('retry')}</Button>
      </div>
    );
  return (
    <div>
      <nav
        className="creator-profile-editor flex gap-3"
        aria-label={t('creatorProfile')}
      >
        <Button
          variant={tab === 'identity' ? 'default' : 'outline'}
          disabled={dirty}
          onClick={() => setTab('identity')}
        >
          {t('creatorIdentity')}
        </Button>
        {canEditAbout && (
          <Button
            variant={tab === 'about' ? 'default' : 'outline'}
            disabled={dirty}
            onClick={() => setTab('about')}
          >
            {t('creatorAbout')}
          </Button>
        )}
      </nav>
      {tab === 'about' ? (
        <CreatorAboutEditor wsId={wsId} />
      ) : (
        <ProfileForm
          key={query.data.id}
          profile={query.data}
          hasPublishedWorlds={hasPublishedWorlds}
        />
      )}
    </div>
  );
}
function ProfileForm({
  profile,
  hasPublishedWorlds,
}: {
  profile: Awaited<ReturnType<typeof getCurrentUserProfile>>;
  hasPublishedWorlds: boolean;
}) {
  const t = useTranslations('lettin');
  const client = useQueryClient();
  const router = useRouter();
  const { dirty, setDirty } = useNavigationGuard();
  const initial = {
    display_name: profile.display_name ?? '',
    bio: profile.bio ?? '',
    handle: profile.handle ?? '',
    avatar_url: profile.avatar_url ?? '',
    banner_url: profile.banner_url ?? '',
  };
  const [fields, setFields] = useState(initial);
  const [savedFields, setSavedFields] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      updateCurrentUserProfile({
        display_name: fields.display_name.trim(),
        ...(fields.handle !== savedFields.handle
          ? { handle: fields.handle.trim().toLowerCase() || null }
          : {}),
        bio: fields.bio || null,
        ...(fields.avatar_url !== savedFields.avatar_url
          ? { avatar_url: fields.avatar_url.trim() || null }
          : {}),
        ...(fields.banner_url !== savedFields.banner_url
          ? { banner_url: fields.banner_url.trim() || null }
          : {}),
      }),
    onSuccess: async () => {
      const normalized = {
        ...fields,
        display_name: fields.display_name.trim(),
        handle:
          fields.handle === savedFields.handle
            ? fields.handle
            : fields.handle.trim().toLowerCase(),
        avatar_url: fields.avatar_url.trim(),
        banner_url: fields.banner_url.trim(),
      };
      setSavedFields(normalized);
      setFields(normalized);
      setDirty(false);
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['lettin-profile'] });
      router.refresh();
    },
  });
  const imageValid = (value: string) =>
    !value.trim() ||
    (() => {
      try {
        return new URL(value.trim()).protocol === 'https:';
      } catch {
        return false;
      }
    })();
  const valid =
    !!fields.display_name.trim() &&
    (fields.handle === savedFields.handle ||
      !fields.handle ||
      isValidNewUsername(fields.handle.trim().toLowerCase())) &&
    (fields.avatar_url === savedFields.avatar_url ||
      imageValid(fields.avatar_url)) &&
    (fields.banner_url === savedFields.banner_url ||
      imageValid(fields.banner_url));
  return (
    <main className="creator-profile-editor">
      <header>
        <p className="lettin-kicker">{t('creatorProfile')}</p>
        <h1>{t('profileHeading')}</h1>
        <p>{t('profileSyncHint')}</p>
      </header>
      <CreatorProfileHeader profile={{ id: profile.id, ...fields }} />
      <form
        className="wiki-profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !uploading) mutation.mutate();
        }}
      >
        {(['display_name', 'handle'] as const).map((field) => (
          <label key={field} className="block space-y-2 text-sm">
            {t(`profile${field}`)}
            <Input
              disabled={mutation.isPending || uploading}
              value={fields[field]}
              type={field.endsWith('_url') ? 'url' : 'text'}
              maxLength={
                field === 'handle' ? 32 : field === 'display_name' ? 100 : 2000
              }
              onChange={(e) => {
                setFields((prev) => ({ ...prev, [field]: e.target.value }));
                setDirty(true);
                setSaved(false);
              }}
            />
            {field === 'handle' && (
              <small className="text-muted-foreground">
                {t('usernameHint')}
              </small>
            )}
          </label>
        ))}
        {(['avatar', 'banner'] as const).map((kind) => (
          <ProfileMediaField
            key={kind}
            kind={kind}
            disabled={mutation.isPending || uploading}
            hasImage={!!fields[`${kind}_url`]}
            onPending={(pending) => {
              setUploading(pending);
              if (pending) setDirty(true);
            }}
            onChange={(url) => {
              setFields((prev) => ({ ...prev, [`${kind}_url`]: url }));
              setDirty(true);
              setSaved(false);
            }}
          />
        ))}
        <label className="block space-y-2 text-sm">
          {t('profilebio')}
          <Textarea
            disabled={mutation.isPending || uploading}
            value={fields.bio}
            maxLength={1000}
            onChange={(e) => {
              setFields((prev) => ({ ...prev, bio: e.target.value }));
              setDirty(true);
              setSaved(false);
            }}
          />
        </label>
        {!valid && <p role="alert">{t('invalidProfile')}</p>}
        {mutation.error && (
          <p role="alert">
            {t(
              mutation.error instanceof InternalApiError &&
                mutation.error.status === 409
                ? 'usernameUnavailable'
                : mutation.error instanceof InternalApiError &&
                    mutation.error.status === 429
                  ? mutation.error.code === 'username_change_cooldown'
                    ? 'usernameCooldown'
                    : 'displayNameLimit'
                  : 'requestFailed'
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={mutation.isPending || uploading || !dirty || !valid}
          >
            {t('saveProfile')}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending || uploading}
              onClick={() => {
                setFields(savedFields);
                setDirty(false);
                setSaved(false);
                mutation.reset();
              }}
            >
              {t('cancel')}
            </Button>
          )}
          {saved && <span role="status">{t('profileSaved')}</span>}
          {hasPublishedWorlds && (
            <Link
              href={`/creators/${savedFields.handle || profile.id}`}
              className="text-sm underline"
              target="_blank"
            >
              {t('publicProfile')}
            </Link>
          )}
        </div>
      </form>
    </main>
  );
}
