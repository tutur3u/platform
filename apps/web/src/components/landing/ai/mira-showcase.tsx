'use client';

import { Bot, Brain, MessageSquare, Sparkles, Zap } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export function MiraShowcase() {
  const t = useTranslations('landing.ai.mira');

  const prompts = [t('prompts.0'), t('prompts.1'), t('prompts.2')];

  const capabilities = [
    {
      icon: Sparkles,
      label: t('capabilities.proactive'),
      color: 'pink',
    },
    {
      icon: Brain,
      label: t('capabilities.contextAware'),
      color: 'purple',
    },
    {
      icon: Zap,
      label: t('capabilities.learning'),
      color: 'blue',
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-dynamic-purple/20 bg-gradient-to-br from-dynamic-purple/5 via-background to-background">
      {/* Header */}
      <div className="border-dynamic-purple/10 border-b p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-dynamic-pink/20 to-dynamic-purple/20">
            <Bot className="h-7 w-7 text-dynamic-pink" />
          </div>
          <div className="flex-1">
            <h3 className="mb-1 font-bold text-xl">{t('title')}</h3>
            <p className="text-foreground/60 text-sm leading-relaxed">
              {t('description')}
            </p>
          </div>
        </div>

        {/* Capability Badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          {capabilities.map((cap) => (
            <Badge
              key={cap.label}
              variant="secondary"
              className={cn(
                'gap-1.5',
                `border-dynamic-${cap.color}/30 bg-dynamic-${cap.color}/10 text-dynamic-${cap.color}`
              )}
            >
              <cap.icon className="h-3.5 w-3.5" />
              {cap.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Chat Demo */}
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-foreground/50 text-xs">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{t('tryAsking')}</span>
        </div>

        <div className="space-y-2">
          {prompts.map((prompt, index) => (
            <div
              key={index}
              className="group cursor-pointer rounded-lg border border-dynamic-purple/10 bg-dynamic-purple/5 px-4 py-2.5 transition-all hover:border-dynamic-purple/30 hover:bg-dynamic-purple/10"
            >
              <span className="text-foreground/70 text-sm transition-colors group-hover:text-foreground">
                "{prompt}"
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
