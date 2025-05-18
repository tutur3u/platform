import { Check, MessageSquare, X } from '@tuturuuu/ui/icons';

export function MessengerComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <MessageSquare className="h-5 w-5 text-dynamic-purple" />
          <span>Chat Comparison</span>
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
                <p>Can everyone review the design mockups?</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                <p>I'll take a look this afternoon</p>
              </div>
              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple"></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Basic messaging</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">No task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">No calendar integration</span>
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
                <p>Can everyone review the design mockups?</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                <p>I'll take a look this afternoon</p>
              </div>
              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple"></div>
            </div>
            <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-1.5 text-xs">
              <p className="font-medium text-dynamic-green">Task Created:</p>
              <p className="text-dynamic-green">
                Review design mockups (Due: Today)
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Advanced messaging</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Task creation from chat</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Calendar integration</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-5">
        <h4 className="mb-3 font-medium text-dynamic-purple">
          Tuturuuu Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Create tasks directly from chat conversations</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Schedule meetings with team members in one click</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>AI generates summaries of important discussions</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Seamless integration with calendar and tasks</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
