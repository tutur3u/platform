'use client';

import { gsap } from '@tuturuuu/ui/gsap';
import { Calendar, CheckSquare, Mail, MessageSquare } from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

const integrations = [
  {
    name: 'TuDo',
    icon: <CheckSquare className="h-8 w-8 text-white" />,
    color: 'from-green-500 to-green-600',
    description: 'Task management that syncs with your calendar',
    comingSoon: true,
  },
  {
    name: 'TuMeet',
    icon: <Calendar className="h-8 w-8 text-white" />,
    color: 'from-blue-500 to-blue-600',
    description: 'Intelligent meeting scheduling and notes',
    comingSoon: true,
  },
  {
    name: 'TuMail',
    icon: <Mail className="h-8 w-8 text-white" />,
    color: 'from-red-500 to-red-600',
    description: 'Email management with calendar integration',
    comingSoon: true,
  },
  {
    name: 'TuChat',
    icon: <MessageSquare className="h-8 w-8 text-white" />,
    color: 'from-yellow-500 to-yellow-600',
    description: 'Team chat with scheduling capabilities',
    comingSoon: true,
  },
];

export function IntegrationsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from('.integrations-title', {
        y: 50,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: '.integrations-title',
          start: 'top bottom-=100',
          toggleActions: 'play none none none',
        },
      });

      const integrationCards = gsap.utils.toArray(
        '.integration-card'
      ) as Element[];

      integrationCards.forEach((card, index) => {
        gsap.from(card, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: card as Element,
            start: 'top bottom-=100',
            toggleActions: 'play none none none',
          },
          delay: index * 0.1,
        });
      });
    }, sectionRef);

    return () => ctx.revert(); // Clean up all animations when component unmounts
  }, []);

  return (
    <section id="integrations" ref={sectionRef} className="bg-gray-50 py-20">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="integrations-title mb-4 text-3xl font-bold md:text-4xl">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              Future Integrations
            </span>
          </h2>
          <p className="integrations-title mx-auto max-w-3xl text-xl text-muted-foreground">
            TuPlan is just the beginning. Our ecosystem is growing to cover all
            your productivity needs.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration, index) => (
            <div
              key={index}
              className="integration-card overflow-hidden rounded-xl bg-white shadow-lg transition-shadow duration-300 hover:shadow-xl"
            >
              <div
                className={`bg-gradient-to-r ${integration.color} flex justify-center p-6`}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
                  {integration.icon}
                </div>
              </div>
              <div className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xl font-bold">{integration.name}</h3>
                  {integration.comingSoon && (
                    <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {integration.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
