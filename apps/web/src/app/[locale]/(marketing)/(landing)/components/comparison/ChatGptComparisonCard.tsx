import { Brain, Check, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function ChatGptComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Brain className="h-5 w-5 text-dynamic-cyan" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Brain className="h-5 w-5 text-dynamic-cyan" />
            <h4 className="font-medium">ChatGPT</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-lg bg-dynamic-light-cyan/30 p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">{t('user')}</p>
              <p>
                {t('schedule_a_meeting_with_the_marketing_team_next_tuesday')}
              </p>
            </div>
            <div className="rounded-lg bg-dynamic-light-cyan/30 p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">ChatGPT:</p>
              <p>
                {t(
                  'i_can_help_you_draft_a_message_to_schedule_that_meeting_but_i_cant_directly_access_your_calendar_or_send_invites'
                )}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-cyan" />
              <span>{t('general_ai_assistance')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                {t('no_calendar_access')}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                {t('no_task_management')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Brain className="h-5 w-5 text-dynamic-cyan" />
            <h4 className="font-medium">Rewise</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-lg border border-dynamic-light-cyan/30 bg-calendar-bg-cyan p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">{t('user')}</p>
              <p>
                {t('schedule_a_meeting_with_the_marketing_team_next_tuesday')}
              </p>
            </div>
            <div className="rounded-lg border border-dynamic-light-cyan/30 bg-calendar-bg-cyan p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">Rewise:</p>
              <p>
                {t(
                  'ive_scheduled_a_meeting_with_the_marketing_team_for_next_tuesday_at_2pm_when_everyone_is_available_ive_sent_calendar_invites_to_all_team_members'
                )}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('productivity_focused_ai')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('full_calendar_integration')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('complete_task_management')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-cyan/30 bg-calendar-bg-cyan p-5">
        <h4 className="mb-3 font-medium text-dynamic-light-cyan">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t(
                'ai_specifically_designed_for_productivity_and_time_management'
              )}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('direct_access_to_your_calendar_tasks_and_meetings')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('understands_your_work_context_and_preferences')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('takes_actions_on_your_behalf_to_save_you_time')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
