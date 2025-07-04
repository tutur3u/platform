'use client';

import { members } from './data';
import MemberCard from './member-card';
import { motion } from 'framer-motion';

type DepartmentName =
  | 'Finance'
  | 'Technology'
  | 'Human Resources'
  | 'Marketing'
  | 'External Relations'
  | 'Executive Board';

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};

const departments: { name: DepartmentName; color: string }[] = [
  { name: 'Finance', color: 'text-dynamic-green' },
  { name: 'Technology', color: 'text-dynamic-blue' },
  { name: 'Human Resources', color: 'text-dynamic-purple' },
  { name: 'Marketing', color: 'text-dynamic-orange' },
  { name: 'External Relations', color: 'text-dynamic-red' },
];

export default function Members() {
  return (
    <div className="flex flex-col items-center px-2 py-12">
      <p className="mt-8 w-full bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 bg-clip-text p-3 text-center text-4xl font-black tracking-tight text-transparent md:text-5xl lg:text-6xl dark:from-yellow-300 dark:via-red-400 dark:to-pink-400">
        Meet Our Team
      </p>
      <div className="relative mx-auto mt-4 mb-8 max-w-4xl rounded-lg border border-border bg-card p-4 text-center text-base tracking-wide text-foreground/80 md:p-6 md:text-lg">
        RMIT Neo Culture Tech Club mostly operates technical events, workshops,
        trainings, etc… related to technology. Our target students are from the
        house of{' '}
        <span className="font-bold text-red-500 dark:text-red-400">SSET</span>.
      </div>

      <div className="my-4">
        <div className="w-full px-2 text-center text-base font-medium text-muted-foreground md:px-40 md:text-lg">
          Our club has 6 core teams:{' '}
          {departments.map((department, index) => (
            <span key={department.name}>
              <span className={`font-semibold ${department.color}`}>
                {department.name}
              </span>
              {index < departments.length - 1 && ', '}
            </span>
          ))}
          , with a dedicated{' '}
          <span className={`font-semibold text-dynamic-pink`}>
            Executive Board
          </span>{' '}
          to oversee the operations of the club.
        </div>
      </div>
      <motion.div
        className="mt-8 grid grid-cols-1 gap-8 px-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          visible: {
            transition: {
              staggerChildren: 0.2,
            },
          },
        }}
      >
        {members.map((p, index) => (
          <motion.div
            key={index}
            className="flex justify-center"
            variants={cardVariants}
          >
            <MemberCard
              name={p.name}
              role={p.role}
              image={p.image}
              bio={p.bio}
              quote={p.quote}
              socials={p.socials}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
