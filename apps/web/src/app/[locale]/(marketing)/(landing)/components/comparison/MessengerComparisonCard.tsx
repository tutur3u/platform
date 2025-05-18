import { Check, MessageSquare, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function MessengerComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <MessageSquare className="text-dynamic-purple h-5 w-5" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <MessageSquare className="h-5 w-5 text-purple-500" />
            <h4 className="font-medium">Messenger</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="flex items-start gap-1">
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple h-5 w-5 flex-shrink-0 rounded-full border"></div>
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-1.5 text-xs">
                <p>{t('can_everyone_review_the_design_mockups')}</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-1.5 text-xs">
                <p>{t('ill_take_a_look_this_afternoon')}</p>
              </div>
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple h-5 w-5 flex-shrink-0 rounded-full border"></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('basic_messaging')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">{t('no_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">
                {t('no_calendar_integration')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="border-dynamic-light-purple/30 mb-4 flex items-center gap-2 border-b pb-3">
            <MessageSquare className="text-dynamic-purple h-5 w-5" />
            <h4 className="font-medium">TuChat</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="flex items-start gap-1">
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple h-5 w-5 flex-shrink-0 rounded-full border"></div>
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-1.5 text-xs">
                <p>{t('can_everyone_review_the_design_mockups')}</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-1.5 text-xs">
                <p>{t('ill_take_a_look_this_afternoon')}</p>
              </div>
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple h-5 w-5 flex-shrink-0 rounded-full border"></div>
            </div>
            <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-1.5 text-xs">
              <p className="text-dynamic-green font-medium">
                {t('task_created')}
              </p>
              <p className="text-dynamic-green">
                {t('review_design_mockups_due_today')}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('advanced_messaging')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('task_creation_from_chat')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('calendar_integration')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-purple mb-3 font-medium">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('create_tasks_directly_from_chat_conversations')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('schedule_meetings_with_team_members_in_one_click')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('ai_generates_summaries_of_important_discussions')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('seamless_integration_with_calendar_and_tasks')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
