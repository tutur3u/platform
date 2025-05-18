import { Check, MessageSquare, X } from '@tuturuuu/ui/icons';

export function MessengerComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <MessageSquare className="text-dynamic-purple h-5 w-5" />
          <span>Chat Comparison</span>
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
                <p>Can everyone review the design mockups?</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-1.5 text-xs">
                <p>I'll take a look this afternoon</p>
              </div>
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple h-5 w-5 flex-shrink-0 rounded-full border"></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Basic messaging</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">No task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">No calendar integration</span>
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
                <p>Can everyone review the design mockups?</p>
              </div>
            </div>
            <div className="flex items-start justify-end gap-1">
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-1.5 text-xs">
                <p>I'll take a look this afternoon</p>
              </div>
              <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple h-5 w-5 flex-shrink-0 rounded-full border"></div>
            </div>
            <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-1.5 text-xs">
              <p className="text-dynamic-green font-medium">Task Created:</p>
              <p className="text-dynamic-green">
                Review design mockups (Due: Today)
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Advanced messaging</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Task creation from chat</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Calendar integration</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-purple mb-3 font-medium">
          Tuturuuu Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Create tasks directly from chat conversations</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Schedule meetings with team members in one click</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>AI generates summaries of important discussions</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Seamless integration with calendar and tasks</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
