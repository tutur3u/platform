import { Check, Video, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function MeetComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Video className="h-5 w-5 text-dynamic-green" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Video className="h-5 w-5 text-green-500" />
            <h4 className="font-medium">Google Meet</h4>
          </div>
          <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-foreground/10">
            <div className="text-xs">{t('video_conference')}</div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('basic_video_conferencing')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('screen_sharing')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                {t('no_ai_meeting_notes')}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                {t('no_automatic_task_creation')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b border-dynamic-light-green/30 pb-3">
            <Video className="h-5 w-5 text-dynamic-green" />
            <h4 className="font-medium">TuMeet</h4>
          </div>
          <div className="mb-3 flex aspect-video items-center justify-center rounded-md border border-dynamic-light-green/30 bg-calendar-bg-green">
            <div className="text-xs text-dynamic-green">
              {t('ai_enhanced_video_conference')}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('advanced_video_conferencing')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('ai_generated_meeting_notes')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('automatic_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('smart_follow_ups')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-5">
        <h4 className="mb-3 font-medium text-dynamic-green">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('ai_automatically_generates_meeting_notes_and_action_items')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('creates_tasks_directly_from_meeting_discussions')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('sends_smart_follow_ups_to_ensure_tasks_are_completed')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('provides_meeting_analytics_to_improve_productivity')}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
