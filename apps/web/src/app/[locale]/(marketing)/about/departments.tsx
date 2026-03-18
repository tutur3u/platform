'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { type CoreDepartmentName, departments } from './data';
import { DepartmentCard } from './department-card';

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};

const coreDepartments: { name: CoreDepartmentName; color: string }[] = [
  { name: 'Technology', color: 'text-dynamic-blue' },
  { name: 'Human Resources', color: 'text-dynamic-purple' },
  { name: 'Marketing', color: 'text-dynamic-orange' },
];

export default function Departments() {
  const [activeDepartmentCard, setActiveDepartmentCard] =
    useState<CoreDepartmentName>('Technology');

  const activeDepartments = departments.filter(
    (department) => department.name === activeDepartmentCard
  );

  return (
    <div className="w-full">
      <section id="about-departments" className="w-full">
        <motion.h1
          className="text-center font-extrabold text-5xl leading-tight md:text-6xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          Our{' '}
          <span className="border-[#FBC721] border-b-4 text-[#5FC6E5]">
            Departments
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
        className="mt-10 flex w-full justify-center px-4"
      >
        {activeDepartments.map((department) => (
          <motion.div
            key={department.name}
            className="relative flex w-full justify-center transition-all duration-300"
            variants={cardVariants}
          >
            <DepartmentCard
              name={department.name as CoreDepartmentName}
              bio={department.bio}
              characteristics={department.characteristics}
              activities={department.activities}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
