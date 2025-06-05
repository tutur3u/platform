'use client';

import TeamMember from './TeamMember';
import { Badge } from '@tuturuuu/ui/badge';
import { Users } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

const TeamSection = () => {
  const teamMembers = [
    {
      name: 'Huynh Duy Thong',
      role: 'RMIT University',
      bio: 'AI Researcher specializing in emotional intelligence systems and natural language processing.',
      color: 'blue',
    },
    {
      name: 'Luong Chi Thanh',
      role: 'RMIT University',
      bio: 'Human-Computer Interaction expert focused on creating empathetic digital experiences.',
      color: 'purple',
    },
    {
      name: 'Hoang Minh Quan',
      role: 'RMIT University',
      bio: 'Software developer with expertise in cross-cultural communication technology.',
      color: 'pink',
    },
  ];

  return (
    <section
      id="team"
      className="relative w-full bg-foreground/5 py-24 dark:bg-foreground/[0.02]"
    >
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/grid-pattern-light.svg')] bg-repeat opacity-5 dark:bg-[url('/grid-pattern-dark.svg')]"></div>
      <div className="absolute top-0 left-0 h-40 w-full bg-linear-to-b from-background to-transparent"></div>
      <div className="absolute bottom-0 left-0 h-40 w-full bg-linear-to-t from-background to-transparent"></div>

      <div className="mx-auto max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <Badge variant="outline" className="mb-4">
            Our Team
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Vietnamese Researchers & Developers
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Committed to strengthening family bonds through technology and
            cultural understanding.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {teamMembers.map((member, index) => (
            <TeamMember
              key={index}
              name={member.name}
              role={member.role}
              bio={member.bio}
              icon={<Users className="h-10 w-10" />}
              color={member.color}
            />
          ))}
        </div>

        {/* Additional values section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-24 text-center"
        >
          <h3 className="mb-8 text-2xl font-bold">Our Values</h3>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Empathy',
                description:
                  'We believe in understanding the emotional needs of both parents and children in Vietnamese families.',
                color: 'bg-purple-500/10 dark:bg-purple-500/20',
              },
              {
                title: 'Cultural Respect',
                description:
                  'Our solutions honor Vietnamese traditions while embracing positive change and modern communication.',
                color: 'bg-blue-500/10 dark:bg-blue-500/20',
              },
              {
                title: 'Ethical AI',
                description:
                  'We develop AI with privacy, consent, and cultural sensitivity as core principles.',
                color: 'bg-pink-500/10 dark:bg-pink-500/20',
              },
            ].map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`rounded-xl p-6 ${value.color}`}
              >
                <h4 className="mb-2 text-lg font-semibold">{value.title}</h4>
                <p className="text-muted-foreground">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TeamSection;
