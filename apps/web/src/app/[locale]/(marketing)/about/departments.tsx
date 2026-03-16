'use client';

import { Award } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { type coreDepartmemt, departments } from './data';
import { DepartmentCard } from './department-card';

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};

const departmentStyles: Record<string, string> = {
  FinLog: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  Technology: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  'Human Resources':
    'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
  Marketing:
    'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
};

const coreDepartments: { name: coreDepartmemt; color: string }[] = [
  { name: 'Technology', color: 'text-dynamic-blue' },
  { name: 'Human Resources', color: 'text-dynamic-purple' },
  { name: 'Marketing', color: 'text-dynamic-yellow' },
];

const renderMissionPoints = (mission: string[]) => {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {mission.map((point, index) => {
        const separatorIndex = point.indexOf(':');

        if (separatorIndex !== -1) {
          const title = point.substring(0, separatorIndex).trim();
          const description = point.substring(separatorIndex + 1).trim();
          return (
            <li key={index}>
              <span className="font-semibold">{title}:</span> {description}
            </li>
          );
        }

        return <li key={index}>{point}</li>;
      })}
    </ul>
  );
};

export default function Departments() {
  const [activeDepartmentCard, setActiveDepartmentCard] =
    useState<coreDepartmemt>('Technology');

  const resolveDepartmentImage = (imagePath: string) => {
    if (imagePath === '/departments/test.jpg') {
      return '/members/departments/test1.jpg';
    }

    if (imagePath.startsWith('/departments/')) {
      return imagePath.replace('/departments/', '/members/departments/');
    }

    return imagePath;
  };

  const activeDepartments = departments.filter(
    (department) => department.name === activeDepartmentCard
  );

  return (
    <div className="w-full">
      <section id="about-departments" className="w-full">
        <motion.h1
          className="mt-4 mb-8 text-center font-extrabold text-6xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Meet Our{' '}
          <span className="relative">
            <span className="border-[#FBC721] border-b-4 text-[#5FC6E5]">
              Department
            </span>
            <motion.div
              className="absolute -top-2 -right-2"
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            >
              <Award className="h-5 w-5 text-[#FBC721] md:h-6 md:w-6" />
            </motion.div>
          </span>
          <motion.div
            className="ml-3 inline-block"
            initial={{ rotate: 0 }}
            whileInView={{ rotate: 360 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          ></motion.div>
        </motion.h1>
      </section>

      <div className="relative mx-auto mt-4 mb-8 max-w-4xl rounded-lg border border-border bg-card p-4 text-center text-base text-foreground/80 tracking-wide md:p-6 md:text-lg">
        Behind every successful club initiative is a dedicated team of
        specialists. From driving innovation and building our community to
        amplifying our message, get to know the diverse departments that turn
        our vision into reality.
      </div>

      <div className="w-full space-y-4 px-2 text-center md:px-40">
        <div className="flex justify-center">
          <div className="flex items-center space-x-1 rounded-lg border border-border bg-card p-1 shadow-sm">
            {coreDepartments.map((core) => (
              <button
                type="button"
                key={core.name}
                onClick={() => setActiveDepartmentCard(core.name)}
                className={`rounded-md px-3 py-1.5 font-semibold transition-colors duration-200 md:px-4 ${
                  activeDepartmentCard === core.name
                    ? `${core.color.replace('text-', 'bg-')}/10 ${core.color}`
                    : `text-muted-foreground hover:${core.color}`
                }`}
              >
                {core.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <motion.div
        key={activeDepartmentCard}
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        transition={{ duration: 0.5 }}
        className="mt-8 flex w-full justify-center px-4"
      >
        {activeDepartments.map((department) => (
          <motion.div
            key={department.name}
            className="relative flex justify-center transition-all duration-300"
            variants={cardVariants}
          >
            <DepartmentCard
              name={department.name}
              image={resolveDepartmentImage(department.image)}
              bio={department.bio}
              characteristics={department.characteristics}
              quote={renderMissionPoints(department.mission)}
              core={department.core}
              className={`rounded-lg border-2 ${
                departmentStyles[department.name] ?? ''
              }`}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
