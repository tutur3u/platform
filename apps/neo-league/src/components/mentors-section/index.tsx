import { Avatar, AvatarFallback } from '@ncthub/ui/avatar';

import { mentors } from './data';

export default function MentorsSection() {
  return (
    <section
      id="mentors"
      className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl shadow-text md:text-4xl">
            MENTORS & <span className="text-secondary">JUDGES</span>
          </h2>
          <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
            Learn from and be evaluated by distinguished faculty from RMIT
            School of Science, Engineering & Technology.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {mentors.map((mentor, index) => (
            <div
              key={index}
              className="glass-card card-hover rounded-xl p-6 text-center"
            >
              <Avatar className="gradient-bg mx-auto mb-4 h-16 w-16">
                <AvatarFallback className="bg-transparent font-black text-2xl text-white">
                  {mentor.name.split(' ').pop()?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <h4 className="mb-1 font-black">{mentor.name}</h4>
              <p className="text-foreground text-sm">{mentor.field}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
