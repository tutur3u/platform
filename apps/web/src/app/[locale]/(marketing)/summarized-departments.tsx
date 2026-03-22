'use client';

import { Card } from '@ncthub/ui/card';
import { cn } from '@ncthub/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import type { CoreDepartmentName } from './about/data';

const departmentCards: {
  name: CoreDepartmentName;
  bio: string;
  image: string;
  color: string;
  hoverColor: string;
}[] = [
  {
    name: 'Technology',
    bio: 'The technical engine of our organization, overseeing all software and hardware initiatives.',
    image: '/departments/technology/competitive-programming-workshop.jpg',
    color: 'text-dynamic-blue border-dynamic-blue/30 bg-dynamic-blue/5',
    hoverColor: 'hover:border-dynamic-blue/50 hover:bg-dynamic-blue/10',
  },
  {
    name: 'Human Resources',
    bio: 'Building a strong, inclusive community within the club through team-building activities and member support.',
    image: '/departments/human-resources/secret-santa-c-2025.jpg',
    color: 'text-dynamic-purple border-dynamic-purple/30 bg-dynamic-purple/5',
    hoverColor: 'hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10',
  },
  {
    name: 'Marketing',
    bio: "Driving our club's visibility and engagement through strategic marketing initiatives.",
    image: '/departments/marketing/test3.jpg',
    color: 'text-dynamic-orange border-dynamic-orange/30 bg-dynamic-orange/5',
    hoverColor: 'hover:border-dynamic-orange/50 hover:bg-dynamic-orange/10',
  },
];

export default function SummarizedDepartments() {
  return (
    <section id="about-departments" className="py-16 md:py-24">
      <motion.h1
        className="text-center font-extrabold text-5xl leading-tight md:text-6xl"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
      >
        Our{' '}
        <span className="border-brand-light-yellow border-b-4 text-brand-light-blue">
          Departments
        </span>
        <motion.div
          className="ml-3 inline-block"
          initial={{ rotate: 0 }}
          whileInView={{ rotate: 360 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        ></motion.div>
      </motion.h1>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {departmentCards.map((department, index) => (
          <motion.div
            key={department.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.12 }}
            viewport={{ once: true }}
          >
            <Link
              href={`/about?department=${encodeURIComponent(department.name)}#about-departments`}
              className="block h-full"
            >
              <Card
                className={cn(
                  'group h-full overflow-hidden border transition-all duration-300 hover:-translate-y-1',
                  department.color,
                  department.hoverColor
                )}
              >
                <div className="relative aspect-video overflow-hidden">
                  <Image
                    src={department.image}
                    alt={`${department.name} department`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>

                <div className="space-y-2 px-4 py-4">
                  <h3 className="font-bold text-lg leading-snug">
                    {department.name}
                  </h3>
                  <p className="text-foreground/80 text-sm leading-relaxed">
                    {department.bio}
                  </p>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
