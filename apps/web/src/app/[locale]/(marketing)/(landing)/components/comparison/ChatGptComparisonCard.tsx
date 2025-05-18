import { Brain, Check, X } from '@tuturuuu/ui/icons';

export function ChatGptComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Brain className="text-dynamic-cyan h-5 w-5" />
          <span>AI Assistant Comparison</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Brain className="text-dynamic-cyan h-5 w-5" />
            <h4 className="text-dynamic-cyan font-medium">ChatGPT</h4>
          </div>
          <div className="mb-3 space-y-2">
            <div className="bg-dynamic-light-cyan/30 rounded-lg p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">User:</p>
              <p>Schedule a meeting with the marketing team next Tuesday</p>
            </div>
            <div className="bg-dynamic-light-cyan/30 rounded-lg p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">ChatGPT:</p>
              <p>
                I can help you draft a message to schedule that meeting, but I
                can't directly access your calendar or send invites.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-cyan h-4 w-4" />
              <span>General AI assistance</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">No calendar access</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">No task management</span>
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
              <p className="text-dynamic-light-cyan font-medium">User:</p>
              <p>Schedule a meeting with the marketing team next Tuesday</p>
            </div>
            <div className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan rounded-lg border p-3 text-sm">
              <p className="text-dynamic-light-cyan font-medium">Rewise:</p>
              <p>
                I've scheduled a meeting with the marketing team for next
                Tuesday at 2pm, when everyone is available. I've sent calendar
                invites to all team members.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Productivity-focused AI</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Full calendar integration</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Complete task management</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-light-cyan mb-3 font-medium">
          Tuturuuu Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              AI specifically designed for productivity and time management
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Direct access to your calendar, tasks, and meetings</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Understands your work context and preferences</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Takes actions on your behalf to save you time</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
