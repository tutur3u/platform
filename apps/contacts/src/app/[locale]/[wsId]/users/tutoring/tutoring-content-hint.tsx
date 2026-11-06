'use client';

import { useTranslations } from 'next-intl';

/** Marks flagged feedback text as the learner's weak-support tutoring content. */
export function TutoringContentHint({ show }: { show: boolean }) {
  const t = useTranslations('ws-user-feedbacks');
  if (!show) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {t('tutoring_content_hint')}
    </p>
  );
}

/** The attention switch help, plus the tutoring-content note while it is on. */
export function RequireAttentionHelp({ tutoring }: { tutoring: boolean }) {
  const t = useTranslations('ws-user-feedbacks');
  return (
    <>
      <div className="text-muted-foreground text-xs">
        {t('requires_attention_description')}
      </div>
      <TutoringContentHint show={tutoring} />
    </>
  );
}
