'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { getInitials } from '@ncthub/utils/name-helper';

import AnimatedSection from '../animated-section';
import { mentors } from './data';

export default function MentorsSection() {
  return (
    <section id="mentors" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl md:text-4xl tracking-wide">
            <span className="font-medium text-[#134e4a] italic">
              MENTORS &{" "}
            </span>
            <span className="relative inline-block font-black text-[#134e4a]">
              JUDGES
              <span className="absolute left-0 -bottom-1 h-[4px] w-full bg-yellow-400"></span>
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
            Learn from and be evaluated by distinguished faculty from RMIT
            School of Science, Engineering & Technology.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {mentors.map((mentor, index) => (
            <AnimatedSection
              key={index}
              delay={Math.floor(index / 4) * 0.1 + (index % 4) * 0.05}
            >
              <div className="card-hover flex flex-col items-center">
                <Avatar className="h-auto w-3/4 rounded-none">
                  <AvatarImage src={mentor.avatar} alt={mentor.name} />
                  <AvatarFallback className="gradient-bg font-black text-2xl text-white">
                    {getInitials(mentor.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="glass-card h-full w-full rounded-xl px-6 py-8 text-center">
                  <h4 className="mb-1 font-black">{mentor.name}</h4>
                  <p className="text-base text-foreground">{mentor.field}</p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
