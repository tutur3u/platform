import { Calendar, Check, Mail, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function GmailComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Mail className="h-5 w-5 text-dynamic-red" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="h-5 w-5 text-dynamic-red" />
            <h4 className="font-medium">Gmail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-md bg-dynamic-light-red/30 p-3 text-sm">
              <div className="font-medium">{t('client_meeting_request')}</div>
              <div className="line-clamp-2 text-dynamic-red">
                {t(
                  'hi_would_you_be_available_for_a_meeting_next_week_to_discuss'
                )}
              </div>
            </div>
            <div className="rounded-md bg-dynamic-light-red/30 p-3 text-sm">
              <div className="font-medium">{t('project_update')}</div>
              <div className="line-clamp-2 text-dynamic-red">
                {t(
                  'here_s_the_latest_update_on_the_project_we_need_to_finalize'
                )}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('basic_email_management')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">{t('no_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                {t('limited_calendar_integration')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="h-5 w-5 text-dynamic-red" />
            <h4 className="font-medium">TuMail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red p-3 text-sm">
              <div className="font-medium text-dynamic-red">
                {t('client_meeting_request')}
              </div>
              <div className="line-clamp-2 text-dynamic-red">
                {t(
                  'hi_would_you_be_available_for_a_meeting_next_week_to_discuss'
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-dynamic-green">
                <Calendar className="h-4 w-4 flex-none" />
                <span>
                  {t('meeting_scheduled')}: {t('tuesday_2pm')}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red p-3 text-sm">
              <div className="font-medium text-dynamic-red">
                {t('project_update')}
              </div>
              <div className="line-clamp-2 text-dynamic-red">
                {t(
                  'here_s_the_latest_update_on_the_project_we_need_to_finalize'
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-dynamic-blue">
                <Check className="h-4 w-4 flex-none" />
                <span>
                  {t('task_created')}: {t('finalize_project_details')}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('smart_email_management')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('automatic_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>{t('seamless_calendar_integration')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-5">
        <h4 className="mb-3 font-medium text-dynamic-red">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('ai_automatically_identifies_action_items_in_emails')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('creates_tasks_and_calendar_events_directly_from_emails')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>{t('smart_follow_up_reminders_for_important_emails')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              {t('prioritizes_emails_based_on_urgency_and_importance')}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
