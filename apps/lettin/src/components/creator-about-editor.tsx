'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLettinCreatorAbout,
  type LettinCreatorAbout,
  saveLettinCreatorAbout,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CreatorAboutView } from './creator-about-view';
import { useNavigationGuard } from './navigation-guard';
import { RichEditor } from './rich-editor';
import { WikiThemeEditor } from './wiki-theme-editor';

export function CreatorAboutEditor({ wsId }: { wsId: string }) {
  const t = useTranslations('lettin');
  const query = useQuery({
    queryKey: ['lettin-about', wsId],
    queryFn: () => getLettinCreatorAbout(wsId),
  });
  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (!query.data)
    return (
      <p role="alert">
        {t('requestFailed')}{' '}
        <Button onClick={() => query.refetch()}>{t('retry')}</Button>
      </p>
    );
  return <AboutForm wsId={wsId} initial={query.data} />;
}
function AboutForm({
  wsId,
  initial,
}: {
  wsId: string;
  initial: LettinCreatorAbout;
}) {
  const t = useTranslations('lettin');
  const client = useQueryClient();
  const { dirty, setDirty } = useNavigationGuard();
  const [draft, setDraft] = useState(initial);
  const [interestsText, setInterestsText] = useState(
    initial.interests.join(', ')
  );
  const [saved, setSaved] = useState(initial);
  const [sourceMode, setSourceMode] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const change = (patch: Partial<LettinCreatorAbout>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const mutation = useMutation({
    mutationFn: () => saveLettinCreatorAbout(wsId, draft),
    onSuccess: (details) => {
      setSaved(details);
      setDirty(false);
      client.setQueryData(['lettin-about', wsId], details);
    },
  });
  const valid = draft.links.every((link) => {
    try {
      return !!link.label.trim() && new URL(link.url).protocol === 'https:';
    } catch {
      return false;
    }
  });
  return (
    <main
      className="creator-profile-editor wiki-theme space-y-6"
      data-wiki-theme={draft.theme.palette}
      data-wiki-type={draft.theme.typography}
      data-wiki-motion={draft.theme.motion}
    >
      <header>
        <h1>{t('creatorAbout')}</h1>
        <p>{t('creatorAboutHint')}</p>
      </header>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !sourceMode && !mutation.isPending) mutation.mutate();
        }}
      >
        <fieldset disabled={mutation.isPending} className="space-y-5">
          <label className="notebook-paper block space-y-2 p-6 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.shared === true}
                onChange={(event) => change({ shared: event.target.checked })}
              />
              {t('shareCreatorAbout')}
            </span>
            <span className="block text-muted-foreground">
              {t('shareCreatorAboutHint')}
            </span>
          </label>
          <div className="notebook-paper grid gap-4 p-6 sm:grid-cols-2">
            {(['headline', 'pronouns', 'location'] as const).map((key) => (
              <label className="block space-y-2 text-sm" key={key}>
                {t(`creator${key}`)}
                <Input
                  value={draft[key]}
                  maxLength={key === 'pronouns' ? 80 : 160}
                  onChange={(event) => change({ [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="block space-y-2 text-sm">
              {t('creatorInterests')}
              <Input
                value={interestsText}
                maxLength={1000}
                onChange={(event) => {
                  setInterestsText(event.target.value);
                  change({
                    interests: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .slice(0, 20)
                      .map((value) => value.slice(0, 60)),
                  });
                }}
              />
            </label>
          </div>
          <RichEditor
            readOnly={mutation.isPending}
            key={editorKey}
            value={draft.content}
            onChange={(content) => change({ content })}
            onSourceModeChange={(editing) => {
              setSourceMode(editing);
              if (editing) setDirty(true);
            }}
          />
          <fieldset className="notebook-paper space-y-4 p-6">
            <legend>{t('creatorLinks')}</legend>
            {draft.links.map((link, index) => (
              <div
                className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
                key={index}
              >
                <Input
                  aria-label={t('creatorLinkLabel')}
                  value={link.label}
                  maxLength={80}
                  onChange={(event) =>
                    change({
                      links: draft.links.map((current, i) =>
                        i === index
                          ? { ...current, label: event.target.value }
                          : current
                      ),
                    })
                  }
                />
                <Input
                  aria-label={t('creatorLinkUrl')}
                  type="url"
                  value={link.url}
                  maxLength={2000}
                  onChange={(event) =>
                    change({
                      links: draft.links.map((current, i) =>
                        i === index
                          ? { ...current, url: event.target.value }
                          : current
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    change({ links: draft.links.filter((_, i) => i !== index) })
                  }
                >
                  {t('remove')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={draft.links.length >= 10}
              onClick={() =>
                change({ links: [...draft.links, { label: '', url: '' }] })
              }
            >
              {t('creatorAddLink')}
            </Button>
          </fieldset>
          <WikiThemeEditor
            label={t('profileTheme')}
            theme={draft.theme}
            onChange={(theme) => change({ theme })}
          />
        </fieldset>
        <div className="flex gap-3">
          <Button
            disabled={!dirty || !valid || sourceMode || mutation.isPending}
          >
            {t('saveProfile')}
          </Button>
          {(dirty || sourceMode) && (
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                setDraft(saved);
                setInterestsText(saved.interests.join(', '));
                setDirty(false);
                setSourceMode(false);
                setEditorKey((key) => key + 1);
                mutation.reset();
              }}
            >
              {t('cancel')}
            </Button>
          )}
        </div>
        {mutation.error && <p role="alert">{t('requestFailed')}</p>}
        {mutation.isSuccess && !dirty && (
          <p role="status">{t('profileSaved')}</p>
        )}
      </form>
      <CreatorAboutView details={draft} />
    </main>
  );
}
