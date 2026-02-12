'use client';

import AnimatedSection from './animated-section';

export default function PhasesSection() {
  const phases = [
    {
      round: '01',
      title: 'PROPOSAL',
      description:
        'Submit a 10-slide digital IoT solution proposal targeting specific SDGs. Present your innovative idea and technical approach.',
      icon: (
        <svg
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      round: '02',
      title: 'PROTOTYPE',
      description:
        'Top 20 teams develop a functional physical prototype, technical documentation, and a 5-minute demo video.',
      icon: (
        <svg
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
    {
      round: '03',
      title: 'FINAL PITCH',
      description:
        'Top 5 finalists perform a live pitch and product demonstration at RMIT Saigon South Campus.',
      icon: (
        <svg
          className="h-8 w-8 p"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      ),
    },
  ];

  return (
    <section id="phases" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl md:text-4xl tracking-wide">
            <span className="font-medium text-[#134e4a] italic">
              COMPETITION{' '}
            </span>
            <span className="relative inline-block font-black text-[#134e4a]">
              PHASES
              <span className="absolute left-0 -bottom-1 h-[4px] w-full bg-yellow-400"></span>
            </span>
          </h2>
          <p className="mx-auto max-w-2xl font-bold text-foreground text-lg">
            Three challenging rounds designed to test your innovation, technical
            skills, and presentation abilities.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {phases.map((phase, index) => (
            <AnimatedSection key={index} delay={index * 0.1} className="h-full">
              <div className="group relative h-full">
                <div className="glass-card card-hover flex h-full flex-col rounded-2xl p-8">
                  <div className="gradient-bg absolute -top-4 -right-4 flex h-16 w-16 items-center justify-center rounded-full font-black text-white text-xl shadow-lg">
                    {phase.round}
                  </div>
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-secondary/30 text-primary dark:bg-secondary/20">
                    {phase.icon}
                  </div>
                  <h3 className="mb-4 font-black text-2xl">{phase.title}</h3>
                  <p className="text-foreground">{phase.description}</p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
