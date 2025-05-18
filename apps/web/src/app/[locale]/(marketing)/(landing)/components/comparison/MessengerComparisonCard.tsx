import { Check, MessageSquare, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function MessengerComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <MessageSquare className="h-5 w-5 text-dynamic-purple" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <MessageSquare className="h-5 w-5 text-purple-500" />
            <h4 className="font-medium">Messenger</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="flex items-start gap-1">
              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple"></div>
              <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                <p>{t('can_everyone_review_the_design_mockups')}</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                <p>{t('ill_take_a_look_this_afternoon')}</p>
              </div>
              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple"></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('basic_messaging')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">{t('no_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                {t('no_calendar_integration')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b border-dynamic-light-purple/30 pb-3">
            <MessageSquare className="h-5 w-5 text-dynamic-purple" />
            <h4 className="font-medium">TuChat</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="flex items-start gap-1">
              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple"></div>
              <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                <p>{t('can_everyone_review_the_design_mockups')}</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                <p>{t('ill_take_a_look_this_afternoon')}</p>
              </div>
              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple"></div>
            </div>
            <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-1.5 text-xs">
              <p className="font-medium text-dynamic-green">
                {t('task_created')}
              </p>
              <p className="text-dynamic-green">
                {t('review_design_mockups_due_today')}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('advanced_messaging')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('task_creation_from_chat')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('calendar_integration')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-5">
        <h4 className="mb-3 font-medium text-dynamic-purple">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('create_tasks_directly_from_chat_conversations')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('schedule_meetings_with_team_members_in_one_click')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('ai_generates_summaries_of_important_discussions')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('seamless_integration_with_calendar_and_tasks')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
