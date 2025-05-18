import { Calendar, Check, Mail, X } from '@tuturuuu/ui/icons';

export function GmailComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Mail className="h-5 w-5 text-dynamic-red" />
          <span>Email Comparison</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="h-5 w-5 text-dynamic-red" />
            <h4 className="font-medium text-dynamic-red">Gmail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-md bg-dynamic-light-red/30 p-3 text-sm">
              <div className="font-medium">Client Meeting Request</div>
              <div className="truncate text-dynamic-red">
                Hi, would you be available for a meeting next week to discuss...
              </div>
            </div>
            <div className="rounded-md bg-dynamic-light-red/30 p-3 text-sm">
              <div className="font-medium">Project Update</div>
              <div className="truncate text-dynamic-red">
                Here's the latest update on the project. We need to finalize...
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Basic email management</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">No task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">
                Limited calendar integration
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="h-5 w-5 text-dynamic-red" />
            <h4 className="font-medium text-dynamic-red">TuMail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red p-3 text-sm">
              <div className="font-medium text-dynamic-red">
                Client Meeting Request
              </div>
              <div className="truncate text-dynamic-red">
                Hi, would you be available for a meeting next week to discuss...
              </div>
              <div className="mt-1 flex items-center gap-1 text-dynamic-green">
                <Calendar className="h-4 w-4" />
                <span>Meeting scheduled: Tuesday, 2pm</span>
              </div>
            </div>
            <div className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red p-3 text-sm">
              <div className="font-medium text-dynamic-red">Project Update</div>
              <div className="truncate text-dynamic-red">
                Here's the latest update on the project. We need to finalize...
              </div>
              <div className="mt-1 flex items-center gap-1 text-dynamic-blue">
                <Check className="h-4 w-4" />
                <span>Task created: Finalize project details</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Smart email management</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Automatic task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Seamless calendar integration</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-5">
        <h4 className="mb-3 font-medium text-dynamic-red">
          TuMail Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>AI automatically identifies action items in emails</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Creates tasks and calendar events directly from emails</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Smart follow-up reminders for important emails</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Prioritizes emails based on urgency and importance</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
