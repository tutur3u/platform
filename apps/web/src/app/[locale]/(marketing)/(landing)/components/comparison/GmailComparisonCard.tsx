import { Calendar, Check, Mail, X } from '@tuturuuu/ui/icons';

export function GmailComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Mail className="text-dynamic-red h-5 w-5" />
          <span>Email Comparison</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="text-dynamic-red h-5 w-5" />
            <h4 className="text-dynamic-red font-medium">Gmail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="bg-dynamic-light-red/30 rounded-md p-3 text-sm">
              <div className="font-medium">Client Meeting Request</div>
              <div className="text-dynamic-red truncate">
                Hi, would you be available for a meeting next week to discuss...
              </div>
            </div>
            <div className="bg-dynamic-light-red/30 rounded-md p-3 text-sm">
              <div className="font-medium">Project Update</div>
              <div className="text-dynamic-red truncate">
                Here's the latest update on the project. We need to finalize...
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Basic email management</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">No task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">
                Limited calendar integration
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="text-dynamic-red h-5 w-5" />
            <h4 className="text-dynamic-red font-medium">TuMail</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-md border p-3 text-sm">
              <div className="text-dynamic-red font-medium">
                Client Meeting Request
              </div>
              <div className="text-dynamic-red truncate">
                Hi, would you be available for a meeting next week to discuss...
              </div>
              <div className="text-dynamic-green mt-1 flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Meeting scheduled: Tuesday, 2pm</span>
              </div>
            </div>
            <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-md border p-3 text-sm">
              <div className="text-dynamic-red font-medium">Project Update</div>
              <div className="text-dynamic-red truncate">
                Here's the latest update on the project. We need to finalize...
              </div>
              <div className="text-dynamic-blue mt-1 flex items-center gap-1">
                <Check className="h-4 w-4" />
                <span>Task created: Finalize project details</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Smart email management</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Automatic task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Seamless calendar integration</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-red/30 bg-calendar-bg-red mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-red mb-3 font-medium">
          TuMail Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>AI automatically identifies action items in emails</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Creates tasks and calendar events directly from emails</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Smart follow-up reminders for important emails</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Prioritizes emails based on urgency and importance</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
