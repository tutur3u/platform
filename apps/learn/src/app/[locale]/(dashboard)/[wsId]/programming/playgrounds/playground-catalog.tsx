'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createHostedPlayground,
  listHostedPlaygrounds,
} from '@tuturuuu/internal-api/playgrounds';
import type {
  PlaygroundIndex,
  PlaygroundLanguage,
} from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
export function PlaygroundCatalog({
  wsId,
  initial,
}: {
  wsId: string;
  initial: PlaygroundIndex;
}) {
  const t = useTranslations('programmingPlayground');
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<PlaygroundLanguage>('python');
  const query = useQuery({
    queryKey: ['hosted-playgrounds', initial.actorId],
    queryFn: () => listHostedPlaygrounds(),
    initialData: initial,
    refetchInterval: 30_000,
  });
  const create = useMutation({
    mutationFn: () => createHostedPlayground({ name, language }),
    onSuccess: (result) =>
      router.push(`/${wsId}/programming/playgrounds/${result.id}`),
  });
  const data = query.data;
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>
      {!data.allowed ? (
        <div className="rounded-xl border p-6">
          <h2 className="font-medium">{t('paidRequired')}</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('benefitHint')}
          </p>
        </div>
      ) : (
        <form
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Label className="space-y-2">
            {t('name')}
            <Input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="space-y-2">
            {t('language')}
            <Select
              value={language}
              onValueChange={(value) =>
                setLanguage(value as PlaygroundLanguage)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.languages.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Button
            type="submit"
            className="self-end"
            disabled={
              create.isPending ||
              !data.languages.includes(language) ||
              !name.trim()
            }
          >
            {t('create')}
          </Button>
          {!data.languages.length && (
            <p role="status" className="text-muted-foreground text-sm">
              {t('noRunners')}
            </p>
          )}
          {create.isError && <p role="alert">{t('failed')}</p>}
        </form>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.projects.map((project) => (
          <Link
            key={project.id}
            href={`/${wsId}/programming/playgrounds/${project.id}`}
            className="rounded-xl border p-5 transition-colors hover:bg-muted/40"
          >
            <h2 className="font-semibold">{project.name}</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {project.language} · {t('driveHint')}
            </p>
          </Link>
        ))}
      </div>
      {!data.projects.length && (
        <p className="text-muted-foreground">{t('empty')}</p>
      )}
    </section>
  );
}
