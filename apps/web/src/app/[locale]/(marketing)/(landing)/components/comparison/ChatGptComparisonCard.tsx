import { Brain, Check, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function ChatGptComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Brain className="text-dynamic-cyan h-5 w-5" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Brain className="text-dynamic-cyan h-5 w-5" />
            <h4 className="font-medium">ChatGPT</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="bg-dynamic-light-cyan/30 rounded-lg p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">{t('user')}</p>
              <p>
                {t('schedule_a_meeting_with_the_marketing_team_next_tuesday')}
              </p>
            </div>
            <div className="bg-dynamic-light-cyan/30 rounded-lg p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">ChatGPT:</p>
              <p>
                {t(
                  'i_can_help_you_draft_a_message_to_schedule_that_meeting_but_i_cant_directly_access_your_calendar_or_send_invites'
                )}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-cyan h-4 w-4" />
              <span>{t('general_ai_assistance')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">
                {t('no_calendar_access')}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">
                {t('no_task_management')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Brain className="text-dynamic-cyan h-5 w-5" />
            <h4 className="font-medium">Rewise</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan rounded-lg border p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">{t('user')}</p>
              <p>
                {t('schedule_a_meeting_with_the_marketing_team_next_tuesday')}
              </p>
            </div>
            <div className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan rounded-lg border p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">Rewise:</p>
              <p>
                {t(
                  'ive_scheduled_a_meeting_with_the_marketing_team_for_next_tuesday_at_2pm_when_everyone_is_available_ive_sent_calendar_invites_to_all_team_members'
                )}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('productivity_focused_ai')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('full_calendar_integration')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('complete_task_management')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-light-cyan mb-3 font-medium">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              {t(
                'ai_specifically_designed_for_productivity_and_time_management'
              )}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              {t('direct_access_to_your_calendar_tasks_and_meetings')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('understands_your_work_context_and_preferences')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('takes_actions_on_your_behalf_to_save_you_time')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
