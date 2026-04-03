'use client';

import AnimatedSection from './animated-section';

export default function DatesSection() {
  const importantDates = [
    {
      round: '01',
      date: '04 April 2026',
      event: 'Opening Ceremony + Requirement Release',
      type: 'Virtual',
      description:
        'Kickoff event with the official opening ceremony and release of competition requirements.',
    },
    {
      round: '02',
      date: '17 April 2026',
      event: 'Registration & Round 1 Deadline',
      type: 'Virtual',
      description:
        'Final deadline for team registration and Round 1 submission.',
    },
    {
      round: '03',
      date: '24 April 2026',
      event: 'Top 20 Announcement + Release Round 2 Instruction',
      type: 'Virtual',
      description:
        'Announcement of the top 20 teams and release of instructions for Round 2.',
    },
    {
      round: '04',
      date: '16 May 2026',
      event: 'Round 2 Deadline',
      type: 'Virtual',
      description: 'Final deadline for Round 2 submission.',
    },
    {
      round: '05',
      date: '23 May 2026',
      event: 'Top 5 Announcement',
      type: 'Virtual',
      description:
        'Announcement of the top 5 teams advancing to the final exhibition.',
    },
    {
      round: '06',
      date: '29 May 2026',
      event: 'Final - Exhibition',
      type: 'RMIT Auditorium',
      description: 'Final exhibition, live pitching, and award ceremony.',
    },
  ];

  return (
    <section id="dates" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl tracking-wide md:text-4xl">
            <span className="font-medium text-brand-teal italic">
              IMPORTANT{' '}
            </span>
            <span className="relative inline-block font-black text-brand-teal">
              DATES
              <span className="absolute -bottom-1 left-0 h-1 w-full bg-yellow-400"></span>
            </span>
          </h2>
        </div>

        {/* Vertical Timeline */}
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute top-0 bottom-0 left-6 w-0.5 bg-linear-to-b from-primary via-secondary to-primary md:left-1/2 md:-translate-x-1/2" />

          <div className="space-y-12">
            {importantDates.map((item, index) => (
              <AnimatedSection key={index} delay={index * 0.1}>
                <div
                  className={`relative flex items-center ${
                    index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Circle with Round Number */}
                  <div className="absolute left-6 z-10 flex h-12 w-12 -translate-x-1/2 items-center justify-center md:left-1/2">
                    <div className="gradient-bg flex h-12 w-12 items-center justify-center rounded-full font-black text-white shadow-lg ring-4 ring-background">
                      {item.round}
                    </div>
                  </div>

                  {/* Content Card */}
                  <div
                    className={`ml-16 w-full md:ml-0 md:w-[calc(50%-3rem)] ${
                      index % 2 === 0 ? 'md:mr-8' : 'md:ml-8'
                    }`}
                  >
                    <div className="glass-card card-hover rounded-2xl p-6">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-primary/20 px-3 py-1 font-bold text-primary text-xs">
                          {item.type}
                        </span>
                        <span className="gradient-text font-bold text-md">
                          {item.date}
                        </span>
                      </div>
                      <h3 className="mb-2 font-black text-xl">{item.event}</h3>
                      <p className="text-foreground text-sm">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          {/* End circle */}
          <div className="absolute -bottom-4 left-6 flex h-8 w-8 -translate-x-1/2 items-center justify-center md:left-1/2">
            <div className="gradient-bg h-4 w-4 rounded-full shadow-lg ring-4 ring-background" />
          </div>
        </div>
      </div>
    </section>
  );
}
