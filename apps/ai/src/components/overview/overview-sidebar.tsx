import {
  ArrowUpRight,
  BookOpen,
  Cpu,
  KeyRound,
  Sparkles,
  Terminal,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { AiStudioOverview } from '@/lib/studio-data';
import { SectionCard } from '../studio/section-card';

const TOKEN_SEGMENTS = [
  { className: 'bg-dynamic-blue', key: 'inputTokens' },
  { className: 'bg-dynamic-green', key: 'outputTokens' },
  { className: 'bg-dynamic-purple', key: 'reasoningTokens' },
] as const;

export async function OverviewSidebar({
  activeKeys,
  canManageAiKeys,
  canManageAiPolicy,
  totals,
  workspaceId,
}: {
  activeKeys: number;
  canManageAiKeys: boolean;
  canManageAiPolicy: boolean;
  totals: AiStudioOverview['totals'];
  workspaceId: string;
}) {
  const t = await getTranslations('ai-studio');
  const home = await getTranslations('ai-studio.home');
  const observability = await getTranslations('ai-studio.observability');

  const tokenLabels: Record<(typeof TOKEN_SEGMENTS)[number]['key'], string> = {
    inputTokens: observability('input_tokens'),
    outputTokens: observability('output_tokens'),
    reasoningTokens: observability('reasoning_tokens'),
  };
  const totalTokens =
    totals.inputTokens + totals.outputTokens + totals.reasoningTokens;

  const links = [
    {
      href: `/${workspaceId}/playground`,
      icon: Terminal,
      label: t('playground'),
    },
    {
      href: `/${workspaceId}/developer-docs`,
      icon: BookOpen,
      label: t('developer-docs'),
    },
    ...(canManageAiPolicy
      ? [
          {
            href: `/${workspaceId}/model-policy`,
            icon: Cpu,
            label: t('model-policy'),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionCard icon={Sparkles} title={home('token_mix')}>
        <div className="font-semibold text-2xl tabular-nums tracking-tight">
          {totalTokens.toLocaleString()}
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {home('token_mix_hint')}
        </p>
        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-foreground/10">
          {TOKEN_SEGMENTS.map(({ className, key }) => (
            <div
              className={className}
              key={key}
              style={{
                width: totalTokens
                  ? `${(totals[key] / totalTokens) * 100}%`
                  : '0%',
              }}
            />
          ))}
        </div>
        <dl className="mt-3 space-y-1.5">
          {TOKEN_SEGMENTS.map(({ className, key }) => (
            <div className="flex items-center gap-2 text-xs" key={key}>
              <span className={`size-2 shrink-0 rounded-full ${className}`} />
              <dt className="flex-1 truncate text-muted-foreground">
                {tokenLabels[key]}
              </dt>
              <dd className="tabular-nums">{totals[key].toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      {canManageAiKeys ? (
        <SectionCard
          actions={
            <Button
              asChild
              className="h-7 px-2.5 text-xs"
              size="sm"
              variant="ghost"
            >
              <Link href={`/${workspaceId}/api-keys`}>
                {t('view-all')}
                <ArrowUpRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          }
          icon={KeyRound}
          title={t('active-keys')}
        >
          <div className="font-semibold text-2xl tabular-nums tracking-tight">
            {activeKeys.toLocaleString()}
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {home('active_keys_hint')}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard bodyClassName="divide-y" flush title={home('quick_links')}>
        {links.map(({ href, icon: Icon, label }) => (
          <Link
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40"
            href={href}
            key={href}
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate">{label}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </Link>
        ))}
      </SectionCard>
    </div>
  );
}
