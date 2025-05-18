import { Brain, Check, X } from '@tuturuuu/ui/icons';

export function ChatGptComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Brain className="h-5 w-5 text-dynamic-cyan" />
          <span>AI Assistant Comparison</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Brain className="h-5 w-5 text-dynamic-cyan" />
            <h4 className="font-medium text-dynamic-cyan">ChatGPT</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="rounded-lg bg-dynamic-light-cyan/30 p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">User:</p>
              <p>Schedule a meeting with the marketing team next Tuesday</p>
            </div>
            <div className="rounded-lg bg-dynamic-light-cyan/30 p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">ChatGPT:</p>
              <p>
                I can help you draft a message to schedule that meeting, but I
                can't directly access your calendar or send invites.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-cyan" />
              <span>General AI assistance</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">No calendar access</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red">No task management</span>
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
              <p className="font-medium text-dynamic-light-cyan">User:</p>
              <p>Schedule a meeting with the marketing team next Tuesday</p>
            </div>
            <div className="rounded-lg border border-dynamic-light-cyan/30 bg-calendar-bg-cyan p-3 text-sm">
              <p className="font-medium text-dynamic-light-cyan">Rewise:</p>
              <p>
                I've scheduled a meeting with the marketing team for next
                Tuesday at 2pm, when everyone is available. I've sent calendar
                invites to all team members.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Productivity-focused AI</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Full calendar integration</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="h-4 w-4 text-dynamic-green" />
              <span>Complete task management</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-dynamic-light-cyan/30 bg-calendar-bg-cyan p-5">
        <h4 className="mb-3 font-medium text-dynamic-light-cyan">
          Tuturuuu Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>
              AI specifically designed for productivity and time management
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Direct access to your calendar, tasks, and meetings</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Understands your work context and preferences</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
            <span>Takes actions on your behalf to save you time</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
