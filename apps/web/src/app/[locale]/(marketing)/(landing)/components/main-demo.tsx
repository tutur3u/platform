import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Mail,
  MessageSquare,
  Sparkles,
  Video,
} from '@tuturuuu/ui/icons';
import { useState } from 'react';

export const MainDemo = ({
  calendarRef,
}: {
  calendarRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const [activeTab, setActiveTab] = useState('calendar');

  return (
    <div className="w-full lg:w-1/2" ref={calendarRef}>
      <div className="relative">
        <div className="bg-dynamic-light-purple absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>
        <div className="bg-dynamic-light-blue absolute -bottom-10 -right-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>

        <div className="relative overflow-hidden rounded-xl border shadow-2xl">
          <div className="from-dynamic-light-indigo via-dynamic-light-blue to-dynamic-light-red dark:from-dynamic-light-indigo/30 dark:via-dynamic-light-orange/30 dark:to-dynamic-light-green/30 bg-gradient-to-br from-10% via-30% to-90% p-3 text-white">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Tuturuuu Workspace</h3>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-red-400"></div>
                <div className="h-3 w-3 rounded-full bg-yellow-400"></div>
                <div className="h-3 w-3 rounded-full bg-green-400"></div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 rounded-lg bg-white/10 p-1 text-center font-semibold">
              <button
                className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'calendar'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('calendar')}
              >
                <Calendar className="h-4 w-4" />
                <div>Calendar</div>
              </button>
              <button
                className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'tasks'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('tasks')}
              >
                <Check className="h-4 w-4" />
                <div>Tasks</div>
              </button>
              <button
                className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'meetings'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('meetings')}
              >
                <Video className="h-4 w-4" />
                <div>Meetings</div>
              </button>
              <button
                className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare className="h-4 w-4" />
                <div>Chat</div>
              </button>
              <button
                className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'mail'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('mail')}
              >
                <Mail className="h-4 w-4" />
                <div>Mail</div>
              </button>
            </div>
          </div>

          <div className="p-4">
            {activeTab === 'calendar' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button className="border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple flex h-8 w-8 items-center justify-center rounded-full border">
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h3 className="font-medium">May 2025</h3>
                    <button className="border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple flex h-8 w-8 items-center justify-center rounded-full border">
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow rounded-md border px-3 py-1 text-xs font-medium">
                      Today
                    </button>
                    <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                      Month
                    </button>
                  </div>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                    <div
                      key={i}
                      className="text-muted-foreground text-center text-sm font-medium"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const isToday = i === 15;
                    const hasMeeting = [3, 8, 10, 15, 16, 22, 27].includes(i);
                    const hasFocus = [4, 11, 18, 25].includes(i);
                    const hasTask = [2, 7, 9, 14, 17, 21, 28].includes(i);
                    const hasHighPriority = [9, 17].includes(i);

                    return (
                      <div
                        key={i}
                        className={`relative flex aspect-square items-center justify-center rounded-md border text-sm font-semibold ${
                          isToday
                            ? 'border-dynamic-purple/30 bg-calendar-bg-purple text-dynamic-purple'
                            : hasMeeting
                              ? 'border-dynamic-blue/30 bg-calendar-bg-blue text-dynamic-blue'
                              : hasFocus
                                ? 'border-dynamic-green/30 bg-calendar-bg-green text-dynamic-green'
                                : hasTask
                                  ? hasHighPriority
                                    ? 'border-dynamic-red/30 bg-calendar-bg-red text-dynamic-red'
                                    : 'border-dynamic-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow'
                                  : 'hover:bg-foreground/5'
                        }`}
                      >
                        {i + 1}
                        {hasHighPriority && (
                          <span className="bg-dynamic-red absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"></span>
                        )}
                        {hasMeeting && !isToday && (
                          <span className="bg-dynamic-blue absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full"></span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="border-dynamic-blue/30 bg-calendar-bg-blue rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="text-dynamic-blue font-medium">
                        Team Sync
                      </div>
                      <div className="bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded px-1.5 text-xs">
                        <Video className="h-3 w-3" />
                        <span>Tuturuuu</span>
                      </div>
                    </div>
                    <div className="text-dynamic-blue text-xs">
                      10:00 - 11:00 AM • All team members available
                    </div>
                  </div>

                  <div className="border-dynamic-yellow/30 bg-calendar-bg-yellow rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="text-dynamic-yellow font-medium">
                        Quarterly Report
                      </div>
                      <div className="bg-calendar-bg-yellow text-dynamic-yellow flex items-center gap-1 rounded px-1.5 text-xs">
                        <Check className="h-3 w-3" />
                        <span>Task</span>
                      </div>
                    </div>
                    <div className="text-dynamic-yellow text-xs">
                      Due in 3 days • 4 hours estimated • Medium priority
                    </div>
                  </div>

                  <div className="border-dynamic-red/30 bg-calendar-bg-red rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="text-dynamic-red font-medium">
                        Client Proposal
                      </div>
                      <div className="bg-calendar-bg-red text-dynamic-red flex items-center gap-1 rounded px-1.5 text-xs">
                        <Check className="h-3 w-3" />
                        <span>High Priority</span>
                      </div>
                    </div>
                    <div className="text-dynamic-red text-xs">
                      Due tomorrow • 2 hours estimated • Auto-scheduled
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">My Tasks</h3>
                  <div className="flex items-center gap-2">
                    <button className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow rounded-md border px-3 py-1 text-xs font-medium">
                      Add Task
                    </button>
                    <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                      Filter
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue hover:border-dynamic-light-blue/30 rounded-lg border p-3 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="border-dynamic-blue mt-0.5 h-5 w-5 rounded-full border-2"></div>
                      <div className="flex-1">
                        <h4 className="text-dynamic-blue font-medium">
                          Finalize Q2 marketing strategy
                        </h4>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due May 20</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>3 hours</span>
                          </span>
                          <span className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red rounded border px-1.5 py-0.5 text-xs">
                            High
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow hover:border-dynamic-light-yellow/30 rounded-lg border p-3 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="border-dynamic-yellow mt-0.5 h-5 w-5 rounded-full border-2"></div>
                      <div className="flex-1">
                        <h4 className="text-dynamic-yellow font-medium">
                          Review product design mockups
                        </h4>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due May 18</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>2 hours</span>
                          </span>
                          <span className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow rounded border px-1.5 py-0.5 text-xs">
                            Medium
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-red/30 bg-calendar-bg-red hover:border-dynamic-light-red/30 rounded-lg border p-3 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="border-dynamic-red mt-0.5 h-5 w-5 rounded-full border-2"></div>
                      <div className="flex-1">
                        <h4 className="text-dynamic-red font-medium">
                          Prepare for team meeting
                        </h4>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due May 16</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>1 hour</span>
                          </span>
                          <span className="border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-green rounded border px-1.5 py-0.5 text-xs">
                            Low
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-green/30 bg-calendar-bg-green mt-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-calendar-bg-green flex h-8 w-8 items-center justify-center rounded-full">
                      <Sparkles className="text-dynamic-green h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-dynamic-green font-medium">
                        AI Suggestion
                      </h4>
                      <p className="text-dynamic-green text-xs">
                        Schedule "Review product design mockups" for tomorrow
                        morning when your focus is highest.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'meetings' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">Upcoming Meetings</h3>
                  <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                    <Video className="h-3 w-3" />
                    <span>New Meeting</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-dynamic-green font-medium">
                        Team Sync
                      </h4>
                      <span className="bg-calendar-bg-green text-dynamic-green rounded px-2 py-0.5 text-xs">
                        Today, 10:00 AM
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-light-green flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          A
                        </div>
                        <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-light-blue flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          B
                        </div>
                        <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-light-yellow flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          C
                        </div>
                        <div className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-light-red flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          D
                        </div>
                      </div>
                      <span className="text-dynamic-blue text-xs">
                        4 participants
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                        <Video className="h-3 w-3" />
                        <span>Join Tuturuuu</span>
                      </button>
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                        View Details
                      </button>
                    </div>
                  </div>

                  <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-dynamic-red font-medium">
                        Client Presentation
                      </h4>
                      <span className="bg-calendar-bg-red text-dynamic-red rounded px-2 py-0.5 text-xs">
                        Tomorrow, 2:00 PM
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-light-red flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          Y
                        </div>
                        <div className="border-dynamic-light-indigo/30 bg-calendar-bg-indigo text-dynamic-light-indigo flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          Z
                        </div>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        2 participants
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                        Prepare
                      </button>
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                        View Details
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow mt-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-calendar-bg-yellow flex h-8 w-8 items-center justify-center rounded-full">
                      <Sparkles className="text-dynamic-yellow h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-dynamic-yellow font-medium">
                        Tuturuuu Features
                      </h4>
                      <p className="text-dynamic-yellow text-xs">
                        AI-generated meeting notes, real-time transcription, and
                        smart follow-ups.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">Team Chat</h3>
                  <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                    <MessageSquare className="h-3 w-3" />
                    <span>New Chat</span>
                  </button>
                </div>

                <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange flex h-1/2 flex-col rounded-lg border">
                  <div className="border-dynamic-light-orange/30 border-b p-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-calendar-bg-orange flex h-8 w-8 items-center justify-center rounded-full">
                        <span className="text-dynamic-orange text-sm font-medium">
                          MP
                        </span>
                      </div>
                      <div>
                        <h4 className="text-dynamic-orange font-medium">
                          Marketing Project
                        </h4>
                        <p className="text-muted-foreground text-xs">
                          5 members • 3 online
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    <div className="flex items-start gap-2">
                      <div className="border-dynamic-light-green/30 bg-calendar-bg-green flex h-8 w-8 items-center justify-center rounded-full border">
                        <span className="text-xs font-medium">A</span>
                      </div>
                      <div className="border-dynamic-light-green/30 bg-calendar-bg-green max-w-[80%] rounded-lg border p-2 text-sm">
                        <p className="text-dynamic-green text-xs font-medium">
                          Alex
                        </p>
                        <p>
                          Has everyone reviewed the latest campaign mockups?
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          10:15 AM
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start justify-end gap-2">
                      <div className="border-dynamic-light-red/30 bg-calendar-bg-red max-w-[80%] rounded-lg border p-2 text-sm">
                        <p className="text-dynamic-red text-xs font-medium">
                          You
                        </p>
                        <p>
                          Yes, I've added my comments in the shared document.
                        </p>
                        <p className="text-dynamic-red mt-1 text-xs">
                          10:17 AM
                        </p>
                      </div>
                      <div className="border-dynamic-light-red/30 bg-calendar-bg-red flex h-8 w-8 items-center justify-center rounded-full border">
                        <span className="text-xs font-medium">Y</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue flex h-8 w-8 items-center justify-center rounded-full border">
                        <span className="text-xs font-medium">B</span>
                      </div>
                      <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue max-w-[80%] rounded-lg border p-2 text-sm">
                        <p className="text-dynamic-blue text-xs font-medium">
                          Ben
                        </p>
                        <p>
                          I'll finish my review by EOD. Need to coordinate with
                          the design team first.
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          10:20 AM
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-orange/30 border-t p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Type a message..."
                        className="border-dynamic-light-orange/30 bg-calendar-bg-orange focus:ring-dynamic-orange flex-1 rounded-lg border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                      />
                      <button className="bg-calendar-bg-orange text-dynamic-orange flex h-8 w-8 items-center justify-center rounded-full">
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mail' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">Smart Mail</h3>
                  <button className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                    <Mail className="h-3 w-3" />
                    <span>Compose</span>
                  </button>
                </div>

                <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-lg border">
                  <div className="border-dynamic-light-red/30 flex items-center gap-2 border-b p-3">
                    <input
                      type="text"
                      placeholder="Search emails..."
                      className="border-dynamic-light-red/30 bg-calendar-bg-red focus:ring-dynamic-red flex-1 rounded-lg border px-3 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                    />
                    <button className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red rounded-md border px-3 py-1.5 text-xs font-medium">
                      Filter
                    </button>
                  </div>

                  <div className="divide-dynamic-light-red/30 divide-y">
                    <div className="bg-calendar-bg-blue hover:bg-dynamic-light-blue/30 cursor-pointer p-3 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue flex h-8 w-8 items-center justify-center rounded-full border">
                          <span className="text-dynamic-blue text-xs font-medium">
                            AC
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-dynamic-blue line-clamp-1 font-medium">
                              Alex Chen
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              10:30 AM
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm font-medium">
                            Project Update: Q2 Marketing Campaign
                          </p>
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            Hi team, I wanted to share the latest updates on our
                            Q2 marketing campaign. We've made significant
                            progress...
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-calendar-bg-yellow hover:bg-dynamic-light-yellow/30 cursor-pointer p-3 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow flex h-8 w-8 items-center justify-center rounded-full border">
                          <span className="text-dynamic-yellow text-xs font-medium">
                            ST
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-dynamic-yellow line-clamp-1 font-medium">
                              Sarah Thompson
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              Yesterday
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            Client feedback on proposal
                          </p>
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            The client has reviewed our proposal and has some
                            feedback. Overall, they're impressed with our
                            approach...
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-calendar-bg-green hover:bg-dynamic-light-green/30 cursor-pointer rounded-b-lg p-3 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="border-dynamic-light-green/30 bg-calendar-bg-green flex h-8 w-8 items-center justify-center rounded-full border">
                          <span className="text-dynamic-green text-xs font-medium">
                            JD
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-dynamic-green line-clamp-1 font-medium">
                              John Doe
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              May 12
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            Meeting follow-up: Action items
                          </p>
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            Following our meeting yesterday, I've compiled a
                            list of action items for each team member...
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue mt-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-calendar-bg-blue flex h-8 w-8 items-center justify-center rounded-full">
                      <Sparkles className="text-dynamic-blue h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-dynamic-blue font-medium">
                        Smart Mail Features
                      </h4>
                      <p className="text-dynamic-blue text-xs">
                        AI-powered email categorization, smart replies, and
                        follow-up reminders.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
