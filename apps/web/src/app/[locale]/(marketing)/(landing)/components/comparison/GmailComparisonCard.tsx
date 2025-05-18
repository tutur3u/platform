import { Calendar, Check, Mail, X } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export function GmailComparisonCard() {
  const t = useTranslations('landing');

  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Mail className="text-dynamic-red h-5 w-5" />
          <span>{t('product_comparison')}</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="text-dynamic-red h-5 w-5" />
            <h4 className="font-medium">Gmail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="bg-dynamic-light-red/30 rounded-md p-3 text-sm">
              <div className="font-medium">{t('client_meeting_request')}</div>
              <div className="text-dynamic-red line-clamp-2">
                {t(
                  'hi_would_you_be_available_for_a_meeting_next_week_to_discuss'
                )}
              </div>
            </div>
            <div className="bg-dynamic-light-red/30 rounded-md p-3 text-sm">
              <div className="font-medium">{t('project_update')}</div>
              <div className="text-dynamic-red line-clamp-2">
                {t(
                  'here_s_the_latest_update_on_the_project_we_need_to_finalize'
                )}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('basic_email_management')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">{t('no_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">
                {t('limited_calendar_integration')}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="text-dynamic-red h-5 w-5" />
            <h4 className="font-medium">TuMail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-md border p-3 text-sm">
              <div className="text-dynamic-red font-medium">
                {t('client_meeting_request')}
              </div>
              <div className="text-dynamic-red line-clamp-2">
                {t(
                  'hi_would_you_be_available_for_a_meeting_next_week_to_discuss'
                )}
              </div>
              <div className="text-dynamic-green mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 flex-none" />
                <span>
                  {t('meeting_scheduled')}: {t('tuesday_2pm')}
                </span>
              </div>
            </div>
            <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-md border p-3 text-sm">
              <div className="text-dynamic-red font-medium">
                {t('project_update')}
              </div>
              <div className="text-dynamic-red line-clamp-2">
                {t(
                  'here_s_the_latest_update_on_the_project_we_need_to_finalize'
                )}
              </div>
              <div className="text-dynamic-blue mt-1 flex items-center gap-2">
                <Check className="h-4 w-4 flex-none" />
                <span>
                  {t('task_created')}: {t('finalize_project_details')}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('smart_email_management')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('automatic_task_creation')}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>{t('seamless_calendar_integration')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-red/30 bg-calendar-bg-red mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-red mb-3 font-medium">
          {t('tuturuuu_advantages')}
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              {t('ai_automatically_identifies_action_items_in_emails')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              {t('creates_tasks_and_calendar_events_directly_from_emails')}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>{t('smart_follow_up_reminders_for_important_emails')}</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              {t('prioritizes_emails_based_on_urgency_and_importance')}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
