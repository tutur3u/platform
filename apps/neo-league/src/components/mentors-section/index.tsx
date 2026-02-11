'use client';

import AnimatedSection from '../animated-section';
import AvatarCard from '../avatar-card';
import { mentors } from './data';

export default function MentorsSection() {
  return (
    <section id="mentors" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl md:text-4xl">
            MENTORS & <span className="text-secondary">JUDGES</span>
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
              <AvatarCard
                avatar={mentor.avatar}
                name={mentor.name}
                subtitle={mentor.field}
                avatarClassName="ease-in-out ease-in-out ease-in-out transition-transform duration-300 hover:scale-110"
              />
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
