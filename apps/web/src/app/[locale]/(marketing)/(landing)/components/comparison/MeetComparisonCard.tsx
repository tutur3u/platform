import { Check, Video, X } from '@tuturuuu/ui/icons';

export function MeetComparisonCard() {
  return (
    <div className="relative space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <Video className="text-dynamic-green h-5 w-5" />
          <span>Meeting Comparison</span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Video className="h-5 w-5 text-green-500" />
            <h4 className="font-medium">Google Meet</h4>
          </div>
          <div className="bg-foreground/10 mb-3 flex aspect-video items-center justify-center rounded-md">
            <div className="text-xs">Video Conference</div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Basic video conferencing</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Screen sharing</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">No AI meeting notes</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <X className="text-dynamic-red h-4 w-4" />
              <span className="text-dynamic-red">
                No automatic task creation
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
          <div className="border-dynamic-light-green/30 mb-4 flex items-center gap-2 border-b pb-3">
            <Video className="text-dynamic-green h-5 w-5" />
            <h4 className="font-medium">TuMeet</h4>
          </div>
          <div className="border-dynamic-light-green/30 bg-calendar-bg-green mb-3 flex aspect-video items-center justify-center rounded-md border">
            <div className="text-dynamic-green text-xs">
              AI-Enhanced Video Conference
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Advanced video conferencing</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>AI-generated meeting notes</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Automatic task creation</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="text-dynamic-green h-4 w-4" />
              <span>Smart follow-ups</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-dynamic-light-green/30 bg-calendar-bg-green mt-6 rounded-lg border p-5">
        <h4 className="text-dynamic-green mb-3 font-medium">
          Tuturuuu Advantages:
        </h4>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>
              AI automatically generates meeting notes and action items
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Creates tasks directly from meeting discussions</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Sends smart follow-ups to ensure tasks are completed</span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
            <span>Provides meeting analytics to improve productivity</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
