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
        <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-dynamic-light-purple opacity-20 blur-3xl filter"></div>
        <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-dynamic-light-blue opacity-20 blur-3xl filter"></div>

        <div className="relative overflow-hidden rounded-xl border shadow-2xl">
          <div className="bg-gradient-to-br from-dynamic-light-indigo from-10% via-dynamic-light-blue via-30% to-dynamic-light-red to-90% p-3 text-white dark:from-dynamic-light-indigo/30 dark:via-dynamic-light-orange/30 dark:to-dynamic-light-green/30">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Tuturuuu Workspace</h3>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-red-400"></div>
                <div className="h-3 w-3 rounded-full bg-yellow-400"></div>
                <div className="h-3 w-3 rounded-full bg-green-400"></div>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2 rounded-lg bg-white/10 p-1 text-center font-semibold md:grid-cols-5">
              <button
                className={`col-span-3 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:col-span-1 ${
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
                className={`col-span-3 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:col-span-1 ${
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
                className={`col-span-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:col-span-1 ${
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
                className={`col-span-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:col-span-1 ${
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
                className={`col-span-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:col-span-1 ${
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
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple">
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h3 className="font-medium">May 2025</h3>
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple">
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-md border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-3 py-1 text-xs font-medium text-dynamic-yellow">
                      Today
                    </button>
                    <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                      Month
                    </button>
                  </div>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                    <div
                      key={i}
                      className="text-center text-sm font-medium text-muted-foreground"
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
                          <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-dynamic-red"></span>
                        )}
                        {hasMeeting && !isToday && (
                          <span className="absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-dynamic-blue"></span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="rounded-md border border-dynamic-blue/30 bg-calendar-bg-blue p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="font-medium text-dynamic-blue">
                        Team Sync
                      </div>
                      <div className="flex items-center gap-1 rounded bg-calendar-bg-blue px-1.5 text-xs text-dynamic-blue">
                        <Video className="h-3 w-3" />
                        <span>Tuturuuu</span>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-blue">
                      10:00 - 11:00 AM • All team members available
                    </div>
                  </div>

                  <div className="rounded-md border border-dynamic-yellow/30 bg-calendar-bg-yellow p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="font-medium text-dynamic-yellow">
                        Quarterly Report
                      </div>
                      <div className="flex items-center gap-1 rounded bg-calendar-bg-yellow px-1.5 text-xs text-dynamic-yellow">
                        <Check className="h-3 w-3" />
                        <span>Task</span>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-yellow">
                      Due in 3 days • 4 hours estimated • Medium priority
                    </div>
                  </div>

                  <div className="rounded-md border border-dynamic-red/30 bg-calendar-bg-red p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="font-medium text-dynamic-red">
                        Client Proposal
                      </div>
                      <div className="flex items-center gap-1 rounded bg-calendar-bg-red px-1.5 text-xs text-dynamic-red">
                        <Check className="h-3 w-3" />
                        <span>High Priority</span>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-red">
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
                    <button className="rounded-md border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-3 py-1 text-xs font-medium text-dynamic-yellow">
                      Add Task
                    </button>
                    <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                      Filter
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3 transition-colors hover:border-dynamic-light-blue/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-dynamic-blue"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-dynamic-blue">
                          Finalize Q2 marketing strategy
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due May 20</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>3 hours</span>
                          </span>
                          <span className="rounded border border-dynamic-light-red/30 bg-calendar-bg-red px-1.5 py-0.5 text-xs text-dynamic-red">
                            High
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-yellow/30 bg-calendar-bg-yellow p-3 transition-colors hover:border-dynamic-light-yellow/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-dynamic-yellow"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-dynamic-yellow">
                          Review product design mockups
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due May 18</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>2 hours</span>
                          </span>
                          <span className="rounded border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-1.5 py-0.5 text-xs text-dynamic-yellow">
                            Medium
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-3 transition-colors hover:border-dynamic-light-red/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-dynamic-red"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-dynamic-red">
                          Prepare for team meeting
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due May 16</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>1 hour</span>
                          </span>
                          <span className="rounded border border-dynamic-light-green/30 bg-calendar-bg-green px-1.5 py-0.5 text-xs text-dynamic-green">
                            Low
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-green">
                      <Sparkles className="h-4 w-4 text-dynamic-green" />
                    </div>
                    <div>
                      <h4 className="font-medium text-dynamic-green">
                        AI Suggestion
                      </h4>
                      <p className="text-xs text-dynamic-green">
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
                  <button className="flex items-center gap-1 rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                    <Video className="h-3 w-3" />
                    <span>New Meeting</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium text-dynamic-green">
                        Team Sync
                      </h4>
                      <span className="rounded bg-calendar-bg-green px-2 py-0.5 text-xs text-dynamic-green">
                        Today, 10:00 AM
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-green/30 bg-calendar-bg-green text-xs font-medium text-dynamic-light-green">
                          A
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-blue/30 bg-calendar-bg-blue text-xs font-medium text-dynamic-light-blue">
                          B
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-xs font-medium text-dynamic-light-yellow">
                          C
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-red/30 bg-calendar-bg-red text-xs font-medium text-dynamic-light-red">
                          D
                        </div>
                      </div>
                      <span className="text-xs text-dynamic-blue">
                        4 participants
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1 rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        <Video className="h-3 w-3" />
                        <span>Join Tuturuuu</span>
                      </button>
                      <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        View Details
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium text-dynamic-red">
                        Client Presentation
                      </h4>
                      <span className="rounded bg-calendar-bg-red px-2 py-0.5 text-xs text-dynamic-red">
                        Tomorrow, 2:00 PM
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-red/30 bg-calendar-bg-red text-xs font-medium text-dynamic-light-red">
                          Y
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-indigo/30 bg-calendar-bg-indigo text-xs font-medium text-dynamic-light-indigo">
                          Z
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        2 participants
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        Prepare
                      </button>
                      <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        View Details
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dynamic-light-yellow/30 bg-calendar-bg-yellow p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-yellow">
                      <Sparkles className="h-4 w-4 text-dynamic-yellow" />
                    </div>
                    <div>
                      <h4 className="font-medium text-dynamic-yellow">
                        Tuturuuu Features
                      </h4>
                      <p className="text-xs text-dynamic-yellow">
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
                  <button className="flex items-center gap-1 rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                    <MessageSquare className="h-3 w-3" />
                    <span>New Chat</span>
                  </button>
                </div>

                <div className="flex h-1/2 flex-col rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange">
                  <div className="border-b border-dynamic-light-orange/30 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-orange">
                        <span className="text-sm font-medium text-dynamic-orange">
                          MP
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium text-dynamic-orange">
                          Marketing Project
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          5 members • 3 online
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
                        <span className="text-xs font-medium">A</span>
                      </div>
                      <div className="max-w-[80%] rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-2 text-sm">
                        <p className="text-xs font-medium text-dynamic-green">
                          Alex
                        </p>
                        <p>
                          Has everyone reviewed the latest campaign mockups?
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          10:15 AM
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start justify-end gap-2">
                      <div className="max-w-[80%] rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-2 text-sm">
                        <p className="text-xs font-medium text-dynamic-red">
                          You
                        </p>
                        <p>
                          Yes, I've added my comments in the shared document.
                        </p>
                        <p className="mt-1 text-xs text-dynamic-red">
                          10:17 AM
                        </p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-red/30 bg-calendar-bg-red">
                        <span className="text-xs font-medium">Y</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-blue/30 bg-calendar-bg-blue">
                        <span className="text-xs font-medium">B</span>
                      </div>
                      <div className="max-w-[80%] rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-2 text-sm">
                        <p className="text-xs font-medium text-dynamic-blue">
                          Ben
                        </p>
                        <p>
                          I'll finish my review by EOD. Need to coordinate with
                          the design team first.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          10:20 AM
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-dynamic-light-orange/30 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Type a message..."
                        className="flex-1 rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-dynamic-orange focus:outline-none"
                      />
                      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-orange text-dynamic-orange">
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
                  <button className="flex items-center gap-1 rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1 text-xs font-medium text-dynamic-red">
                    <Mail className="h-3 w-3" />
                    <span>Compose</span>
                  </button>
                </div>

                <div className="rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red">
                  <div className="flex items-center gap-2 border-b border-dynamic-light-red/30 p-3">
                    <input
                      type="text"
                      placeholder="Search emails..."
                      className="flex-1 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-dynamic-red focus:outline-none"
                    />
                    <button className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1.5 text-xs font-medium text-dynamic-red">
                      Filter
                    </button>
                  </div>

                  <div className="divide-y divide-dynamic-light-red/30">
                    <div className="cursor-pointer bg-calendar-bg-blue p-3 transition-colors hover:bg-dynamic-light-blue/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-blue/30 bg-calendar-bg-blue">
                          <span className="text-xs font-medium text-dynamic-blue">
                            AC
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="line-clamp-1 font-medium text-dynamic-blue">
                              Alex Chen
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              10:30 AM
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm font-medium">
                            Project Update: Q2 Marketing Campaign
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            Hi team, I wanted to share the latest updates on our
                            Q2 marketing campaign. We've made significant
                            progress...
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="cursor-pointer bg-calendar-bg-yellow p-3 transition-colors hover:bg-dynamic-light-yellow/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-yellow/30 bg-calendar-bg-yellow">
                          <span className="text-xs font-medium text-dynamic-yellow">
                            ST
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="line-clamp-1 font-medium text-dynamic-yellow">
                              Sarah Thompson
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              Yesterday
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            Client feedback on proposal
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            The client has reviewed our proposal and has some
                            feedback. Overall, they're impressed with our
                            approach...
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="cursor-pointer rounded-b-lg bg-calendar-bg-green p-3 transition-colors hover:bg-dynamic-light-green/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
                          <span className="text-xs font-medium text-dynamic-green">
                            JD
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="line-clamp-1 font-medium text-dynamic-green">
                              John Doe
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              May 12
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            Meeting follow-up: Action items
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            Following our meeting yesterday, I've compiled a
                            list of action items for each team member...
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-blue">
                      <Sparkles className="h-4 w-4 text-dynamic-blue" />
                    </div>
                    <div>
                      <h4 className="font-medium text-dynamic-blue">
                        Smart Mail Features
                      </h4>
                      <p className="text-xs text-dynamic-blue">
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
