'use client';

import { ChatGptComparisonCard } from './comparison/ChatGptComparisonCard';
import { GmailComparisonCard } from './comparison/GmailComparisonCard';
import { MeetComparisonCard } from './comparison/MeetComparisonCard';
import { MessengerComparisonCard } from './comparison/MessengerComparisonCard';
import { Button } from '@tuturuuu/ui/button';
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  ArrowRight,
  Brain,
  Calendar,
  Check,
  Mail,
  MessageSquare,
  Sparkles,
  Video,
  X,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

interface Competitor {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  features: { name: string; tuturuuu: boolean; competitor: boolean }[];
  description: string;
}

const competitors: Competitor[] = [
  {
    id: 'calendar',
    name: 'Google Calendar',
    icon: <Calendar className="h-6 w-6" />,
    color: 'blue',
    bgColor: 'bg-blue-500',
    features: [
      { name: 'Basic scheduling', tuturuuu: true, competitor: true },
      { name: 'Calendar sharing', tuturuuu: true, competitor: true },
      { name: 'AI-powered scheduling', tuturuuu: true, competitor: false },
      { name: 'Focus time protection', tuturuuu: true, competitor: false },
      { name: 'Workload balancing', tuturuuu: true, competitor: false },
      { name: 'Task integration', tuturuuu: true, competitor: false },
      { name: 'Team availability matching', tuturuuu: true, competitor: false },
    ],
    description:
      'Google Calendar is great for basic scheduling, but lacks the AI-powered features that make Tuturuuu truly intelligent. Tuturuuu automatically optimizes your schedule based on priorities, deadlines, and workload.',
  },
  {
    id: 'meet',
    name: 'Google Meet',
    icon: <Video className="h-6 w-6" />,
    color: 'green',
    bgColor: 'bg-green-500',
    features: [
      { name: 'Video conferencing', tuturuuu: true, competitor: true },
      { name: 'Screen sharing', tuturuuu: true, competitor: true },
      { name: 'Calendar integration', tuturuuu: true, competitor: true },
      { name: 'AI-generated meeting notes', tuturuuu: true, competitor: false },
      { name: 'Automatic task creation', tuturuuu: true, competitor: false },
      { name: 'Smart follow-ups', tuturuuu: true, competitor: false },
      { name: 'Meeting analytics', tuturuuu: true, competitor: false },
    ],
    description:
      'Google Meet provides basic video conferencing, but Tuturuuu meetings go further with AI-powered features like automatic note-taking, task creation from meetings, and smart follow-ups to ensure nothing falls through the cracks.',
  },
  {
    id: 'messenger',
    name: 'Messenger',
    icon: <MessageSquare className="h-6 w-6" />,
    color: 'purple',
    bgColor: 'bg-purple-500',
    features: [
      { name: 'Real-time messaging', tuturuuu: true, competitor: true },
      { name: 'File sharing', tuturuuu: true, competitor: true },
      { name: 'Group chats', tuturuuu: true, competitor: true },
      { name: 'Calendar integration', tuturuuu: true, competitor: false },
      { name: 'Task creation from chat', tuturuuu: true, competitor: false },
      { name: 'Meeting scheduling', tuturuuu: true, competitor: false },
      { name: 'AI chat summaries', tuturuuu: true, competitor: false },
    ],
    description:
      "Messenger is great for casual chats, but Tuturuuu's chat system is designed for productivity. Create tasks directly from conversations, schedule meetings with a click, and get AI-generated summaries of important discussions.",
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: <Brain className="h-6 w-6" />,
    color: 'blue',
    bgColor: 'bg-cyan-500',
    features: [
      { name: 'AI assistance', tuturuuu: true, competitor: true },
      {
        name: 'Natural language understanding',
        tuturuuu: true,
        competitor: true,
      },
      { name: 'Calendar integration', tuturuuu: true, competitor: false },
      { name: 'Task management', tuturuuu: true, competitor: false },
      { name: 'Meeting scheduling', tuturuuu: true, competitor: false },
      { name: 'Email integration', tuturuuu: true, competitor: false },
      { name: 'Unified workspace', tuturuuu: true, competitor: false },
    ],
    description:
      "ChatGPT provides general AI assistance, but Tuturuuu's AI is specifically designed for productivity. It understands your calendar, tasks, and workflow to provide contextual assistance that makes you more productive.",
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: <Mail className="h-6 w-6" />,
    color: 'red',
    bgColor: 'bg-red-500',
    features: [
      { name: 'Email management', tuturuuu: true, competitor: true },
      { name: 'Basic categorization', tuturuuu: true, competitor: true },
      { name: 'AI-powered prioritization', tuturuuu: true, competitor: false },
      { name: 'Task creation from emails', tuturuuu: true, competitor: false },
      { name: 'Meeting scheduling', tuturuuu: true, competitor: false },
      { name: 'Smart follow-ups', tuturuuu: true, competitor: false },
      { name: 'Calendar integration', tuturuuu: true, competitor: true },
    ],
    description:
      "Gmail handles your emails, but Tuturuuu's smart mail system intelligently prioritizes messages, creates tasks from emails, and ensures important communications never fall through the cracks.",
  },
];

export function ComparisonSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeCompetitor, setActiveCompetitor] = useState('calendar');
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  useEffect(() => {
    if (!sectionRef.current) return;

    // Title animation
    gsap.from('.comparison-title-wrapper', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.comparison-title-wrapper',
        start: 'top bottom-=100',
      },
    });

    // Competition tabs animation
    gsap.from('.competitor-button', {
      y: 30,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      scrollTrigger: {
        trigger: '.comparison-title-wrapper',
        start: 'top bottom-=100',
      },
    });

    // Card animation
    gsap.from('.comparison-content', {
      y: 40,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.comparison-tabs',
        start: 'bottom bottom-=50',
      },
    });

    // Feature rows staggered animation
    gsap.from('.feature-row', {
      y: 15,
      opacity: 0,
      duration: 0.4,
      stagger: 0.05,
      scrollTrigger: {
        trigger: '.feature-table',
        start: 'top bottom-=50',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [activeCompetitor]);

  const currentCompetitor = (competitors.find(
    (c) => c.id === activeCompetitor
  ) || competitors[0]) as Competitor;

  const displayedFeatures = showAllFeatures
    ? currentCompetitor.features
    : currentCompetitor.features.slice(0, 5);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden py-24 md:py-40"
    >
      {/* Background decorations */}
      <div className="bg-dynamic-light-purple/10 absolute -left-40 top-20 h-96 w-96 rounded-full blur-3xl filter"></div>
      <div className="bg-dynamic-light-blue/10 absolute -bottom-40 -right-40 h-96 w-96 rounded-full blur-3xl filter"></div>

      <div className="container mx-auto px-4">
        <div className="comparison-title-wrapper mb-16 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-purple-100 px-4 py-1 dark:bg-purple-900/30">
            <Sparkles className="mr-2 h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              Competitive Advantage
            </span>
          </div>
          <h2 className="comparison-title mb-6 text-4xl font-bold md:text-5xl">
            <span className="from-dynamic-light-purple to-dynamic-light-blue bg-gradient-to-r bg-clip-text text-transparent">
              Why Choose Tuturuuu?
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed">
            See how Tuturuuu compares to traditional productivity tools and why
            it's the smarter choice
          </p>
        </div>

        <div className="comparison-tabs mb-12 flex flex-wrap justify-center gap-4">
          {competitors.map((competitor) => (
            <button
              key={competitor.id}
              className={`competitor-button flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
                activeCompetitor === competitor.id
                  ? `${competitor.bgColor} text-white shadow-md`
                  : 'text-muted-foreground hover:text-foreground dark:bg-foreground/5 dark:hover:bg-foreground/10 border bg-white/90 hover:border-gray-300 hover:bg-white hover:shadow-sm'
              }`}
              onClick={() => setActiveCompetitor(competitor.id)}
              aria-pressed={activeCompetitor === competitor.id}
            >
              <div
                className={`${activeCompetitor === competitor.id ? 'text-white' : 'text-gray-500'}`}
              >
                {competitor.icon}
              </div>
              <span>vs {competitor.name}</span>
            </button>
          ))}
        </div>

        <div className="comparison-content grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-8 flex items-center gap-4">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-xl ${currentCompetitor.bgColor} bg-opacity-90 shadow-md`}
              >
                <div className="text-white">{currentCompetitor.icon}</div>
              </div>
              <div>
                <h3 className="mb-1 text-2xl font-bold">
                  Tuturuuu vs {currentCompetitor.name}
                </h3>
                <div className="text-muted-foreground text-sm">
                  Discover the key differences
                </div>
              </div>
            </div>

            <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
              {currentCompetitor.description}
            </p>

            <div className="feature-table dark:bg-foreground/5 mb-10 overflow-hidden rounded-xl border bg-white/90 shadow-lg backdrop-blur-sm">
              <div className="from-dynamic-light-purple to-dynamic-light-blue grid grid-cols-3 bg-gradient-to-r p-5 text-white">
                <div className="col-span-1 font-medium">Feature</div>
                <div className="col-span-1 text-center font-medium">
                  Tuturuuu
                </div>
                <div className="col-span-1 text-center font-medium">
                  {currentCompetitor.name}
                </div>
              </div>

              {displayedFeatures.map((feature, index) => (
                <div
                  key={index}
                  className={`feature-row grid grid-cols-3 items-center p-5 ${index % 2 === 0 ? 'dark:bg-foreground/10 bg-gray-50' : 'dark:bg-foreground/5 bg-white'}`}
                >
                  <div className="col-span-1 font-medium">{feature.name}</div>
                  <div className="col-span-1 flex justify-center">
                    {feature.tuturuuu ? (
                      <div className="border-dynamic-light-green/30 bg-calendar-bg-green flex h-10 w-10 items-center justify-center rounded-full border transition-transform duration-300 hover:scale-110">
                        <Check className="text-dynamic-green h-5 w-5" />
                      </div>
                    ) : (
                      <div className="border-dynamic-light-red/30 bg-calendar-bg-red flex h-10 w-10 items-center justify-center rounded-full border">
                        <X className="text-dynamic-red h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {feature.competitor ? (
                      <div className="border-dynamic-light-green/30 bg-calendar-bg-green flex h-10 w-10 items-center justify-center rounded-full border">
                        <Check className="text-dynamic-green h-5 w-5" />
                      </div>
                    ) : (
                      <div className="border-dynamic-light-red/30 bg-calendar-bg-red flex h-10 w-10 items-center justify-center rounded-full border transition-transform duration-300 hover:scale-110">
                        <X className="text-dynamic-red h-5 w-5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {currentCompetitor.features.length > 5 && (
                <div className="flex justify-center border-t p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllFeatures(!showAllFeatures)}
                    className="text-muted-foreground hover:text-foreground text-sm font-medium"
                  >
                    {showAllFeatures ? 'Show Less' : 'Show All Features'}
                  </Button>
                </div>
              )}
            </div>

            <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-xl border p-6">
              <h4 className="text-dynamic-purple mb-4 text-lg font-medium">
                The Tuturuuu Difference
              </h4>
              <p className="text-dynamic-purple/90 mb-6">
                Tuturuuu combines the best of traditional tools with powerful AI
                to create a seamless, intuitive experience that actually saves
                you time.
              </p>
              <Button className="bg-gradient-to-r from-purple-600 to-blue-500 text-white hover:shadow-md">
                Try Tuturuuu Free
              </Button>
            </div>
          </div>

          <div>
            <div className="dark:bg-foreground/5 relative overflow-hidden rounded-xl border bg-white/90 p-6 shadow-xl backdrop-blur-sm">
              <div className="from-dynamic-light-purple to-dynamic-light-blue absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-gradient-to-br opacity-20 blur-3xl filter"></div>

              {activeCompetitor === 'calendar' && (
                <div className="relative space-y-4">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-medium">
                      <Calendar className="text-dynamic-blue h-5 w-5" />
                      <span>Calendar Comparison</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="dark:bg-foreground/5 rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg">
                      <div className="mb-4 flex items-center gap-2 border-b pb-3">
                        <Calendar className="h-5 w-5 text-blue-500" />
                        <h4 className="font-medium">Google Calendar</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-calendar-bg-blue rounded-md p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                          <div className="font-medium">Team Meeting</div>
                          <div className="text-dynamic-blue">
                            10:00 AM - 11:00 AM
                          </div>
                        </div>
                        <div className="bg-calendar-bg-blue rounded-md p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                          <div className="font-medium">Client Call</div>
                          <div className="text-dynamic-blue">
                            1:00 PM - 2:00 PM
                          </div>
                        </div>
                        <div className="bg-calendar-bg-blue rounded-md p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                          <div className="font-medium">Project Review</div>
                          <div className="text-dynamic-blue">
                            3:00 PM - 4:00 PM
                          </div>
                        </div>
                      </div>
                      <div className="text-dynamic-red mt-4 flex items-center gap-1 text-sm">
                        <X className="h-4 w-4" />
                        <span>No focus time protection</span>
                      </div>
                    </div>

                    <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
                      <div className="border-dynamic-light-purple/30 mb-4 flex items-center gap-2 border-b pb-3">
                        <Calendar className="text-dynamic-purple h-5 w-5" />
                        <h4 className="font-medium">TuPlan</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-md border p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                          <div className="text-dynamic-green font-medium">
                            Focus Time
                          </div>
                          <div className="text-dynamic-green">
                            9:00 AM - 11:00 AM
                          </div>
                        </div>
                        <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue rounded-md border p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                          <div className="text-dynamic-blue font-medium">
                            Team Meeting
                          </div>
                          <div className="text-dynamic-blue">
                            11:30 AM - 12:30 PM
                          </div>
                        </div>
                        <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange rounded-md border p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                          <div className="text-dynamic-orange font-medium">
                            Client Call
                          </div>
                          <div className="text-dynamic-orange">
                            2:00 PM - 3:00 PM
                          </div>
                        </div>
                      </div>
                      <div className="text-dynamic-green mt-4 flex items-center gap-1 text-sm">
                        <Check className="h-4 w-4" />
                        <span>AI optimized for focus time</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue mt-6 rounded-lg border p-5">
                    <h4 className="text-dynamic-blue mb-3 font-medium">
                      Tuturuuu Advantages:
                    </h4>
                    <ul className="space-y-2.5 text-sm">
                      <li className="flex items-start gap-3">
                        <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
                        <span>
                          Automatically protects focus time for deep work based
                          on your preferences
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
                        <span>
                          Balances workload to prevent burnout and
                          overcommitment
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
                        <span>
                          Intelligently schedules meetings when team energy is
                          highest for more productive collaboration
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="text-dynamic-green mt-0.5 h-5 w-5" />
                        <span>
                          Integrates tasks directly into your calendar with
                          smart prioritization
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 text-center">
                    <div className="mb-3 font-medium">
                      Ready to upgrade your calendar?
                    </div>
                    <Button
                      className="from-dynamic-light-purple to-dynamic-light-blue w-full bg-gradient-to-r text-white"
                      size="lg"
                    >
                      Get Started <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {activeCompetitor === 'meet' && <MeetComparisonCard />}
              {activeCompetitor === 'messenger' && <MessengerComparisonCard />}
              {activeCompetitor === 'chatgpt' && <ChatGptComparisonCard />}
              {activeCompetitor === 'gmail' && <GmailComparisonCard />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
