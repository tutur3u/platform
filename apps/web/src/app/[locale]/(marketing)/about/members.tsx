'use client';

import { DepartmentName, members } from './data';
import MemberCard from './member-card';
import { Badge } from '@ncthub/ui/badge';
import { Crown } from '@ncthub/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};

const departments: { name: DepartmentName; color: string }[] = [
  { name: 'FinLog', color: 'text-dynamic-green' },
  { name: 'Technology', color: 'text-dynamic-blue' },
  { name: 'Human Resources', color: 'text-dynamic-purple' },
  { name: 'Marketing', color: 'text-dynamic-orange' },
];

export default function Members() {
  const [hoveredDepartment, setHoveredDepartment] =
    useState<DepartmentName | null>(null);
  const [lockedDepartment, setLockedDepartment] =
    useState<DepartmentName | null>(null);
  const [selectedGeneration, setSelectedGeneration] = useState<6 | 7>(7);

  const activeDepartment = lockedDepartment || hoveredDepartment;

  // Filter members by generation
  const currentMembers = members.filter(
    (member) => member.generation === selectedGeneration
  );

  const isHidden = (memberDepartments: DepartmentName[]) => {
    if (!activeDepartment) return false;

    return !memberDepartments.includes(activeDepartment);
  };

  const handleDepartmentClick = (departmentName: DepartmentName) => {
    if (lockedDepartment === departmentName) {
      setLockedDepartment(null); // Unlock if clicking the same department
    } else {
      setLockedDepartment(departmentName);
    }
  };

  return (
    <div className="flex flex-col items-center px-2 py-4">
      <motion.h1
        className="mb-8 mt-4 text-center text-6xl font-extrabold"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span className="border-b-4 border-[#5FC6E5] pb-2">Meet Our Team</span>
        <motion.div
          className="ml-3 inline-block"
          initial={{ rotate: 0 }}
          whileInView={{ rotate: 360 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <Crown className="h-8 w-8 text-[#FBC721]" />
        </motion.div>
      </motion.h1>

      <div className="border-border bg-card text-foreground/80 relative mx-auto mb-8 mt-4 max-w-4xl rounded-lg border p-4 text-center text-base tracking-wide md:p-6 md:text-lg">
        {selectedGeneration === 7 ? (
          <>
            RMIT Neo Culture Tech Club mostly operates technical events,
            workshops, trainings, etc… related to technology. Our target
            students are from the house of{' '}
            <span className="font-bold text-[#5FC6E5]">SSET</span>.
          </>
        ) : (
          <>
            Meet the{' '}
            <span className="font-bold text-[#FBC721]">Generation 6</span>{' '}
            leaders who built the foundation of NEO Culture Tech. These
            pioneering members established the traditions, values, and
            organizational structures that continue to guide our club today.
          </>
        )}
      </div>

      <div className="my-4">
        <div className="text-muted-foreground w-full px-2 text-center text-base font-medium md:px-40 md:text-lg">
          Our club has 4 core teams:{' '}
          {departments.map((department, index) => (
            <span key={department.name}>
              <span
                className={`font-semibold ${department.color} cursor-pointer transition-all duration-200 hover:underline ${
                  lockedDepartment === department.name
                    ? 'rounded px-1 underline ring-2 ring-current'
                    : ''
                }`}
                onMouseEnter={() => setHoveredDepartment(department.name)}
                onMouseLeave={() => setHoveredDepartment(null)}
                onClick={() => handleDepartmentClick(department.name)}
              >
                {department.name}
              </span>
              {index < departments.length - 1 && ', '}
            </span>
          ))}
          , with a dedicated{' '}
          <span
            className={`text-dynamic-pink cursor-pointer font-semibold transition-all duration-200 hover:underline ${
              lockedDepartment === 'Executive Board'
                ? 'rounded px-1 underline ring-2 ring-current'
                : ''
            }`}
            onMouseEnter={() => setHoveredDepartment('Executive Board')}
            onMouseLeave={() => setHoveredDepartment(null)}
            onClick={() => handleDepartmentClick('Executive Board')}
          >
            Executive Board
          </span>{' '}
          to oversee the operations of the club.
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedGeneration}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          {currentMembers.length === 6 ? (
            // Layout for 6 members
            <motion.div
              className="mt-8 grid grid-cols-1 justify-items-center gap-8 px-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    staggerChildren: 0.2,
                  },
                },
              }}
            >
              {currentMembers.map((p) => (
                <motion.div
                  key={p.name}
                  className={`relative flex justify-center transition-all duration-300 ${
                    isHidden(p.departments)
                      ? 'scale-95 opacity-20'
                      : 'scale-100 opacity-100'
                  }`}
                  variants={cardVariants}
                >
                  {isHidden(p.departments) && (
                    <div className="absolute inset-0 z-10 rounded-lg bg-black/20 backdrop-blur-[1px]" />
                  )}
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
          ) : (
            // Layout for 7+ members
            <>
              {/* First row - 4 members */}
              <motion.div
                className="mt-8 grid grid-cols-1 justify-items-center gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: 0.2,
                    },
                  },
                }}
              >
                {currentMembers.slice(0, 4).map((p) => (
                  <motion.div
                    key={p.name}
                    className={`relative flex justify-center transition-all duration-300 ${
                      isHidden(p.departments)
                        ? 'scale-95 opacity-20'
                        : 'scale-100 opacity-100'
                    }`}
                    variants={cardVariants}
                  >
                    {isHidden(p.departments) && (
                      <div className="absolute inset-0 z-10 rounded-lg bg-black/20 backdrop-blur-[1px]" />
                    )}
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

              {/* Second row - remaining members centered */}
              {currentMembers.length > 4 && (
                <motion.div
                  className="mt-8 grid grid-cols-1 justify-items-center gap-8 px-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: {
                      transition: {
                        staggerChildren: 0.2,
                        delayChildren: 0.4,
                      },
                    },
                  }}
                >
                  {currentMembers.slice(4).map((p) => (
                    <motion.div
                      key={p.name}
                      className={`relative flex justify-center transition-all duration-300 ${
                        isHidden(p.departments)
                          ? 'scale-95 opacity-20'
                          : 'scale-100 opacity-100'
                      }`}
                      variants={cardVariants}
                    >
                      {isHidden(p.departments) && (
                        <div className="absolute inset-0 z-10 rounded-lg bg-black/20 backdrop-blur-[1px]" />
                      )}
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
              )}
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 mt-6 flex flex-col items-center gap-3"
        >
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm font-medium">
              Generation:
            </span>
            <Select
              value={selectedGeneration.toString()}
              onValueChange={(value) =>
                setSelectedGeneration(Number(value) as 6 | 7)
              }
            >
              <SelectTrigger className="border-border bg-card hover:bg-muted h-10 w-52 transition-colors">
                <SelectValue placeholder="Select generation..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7" className="focus:bg-[#5FC6E5]/10">
                  <div className="flex w-full cursor-pointer items-center gap-2">
                    <span className="font-medium">Generation 7</span>
                    <Badge
                      variant="outline"
                      className="ml-auto border-[#5FC6E5] text-xs text-[#5FC6E5]"
                    >
                      Current
                    </Badge>
                  </div>
                </SelectItem>
                <SelectItem value="6" className="focus:bg-[#FBC721]/10">
                  <div className="flex w-full cursor-pointer items-center gap-2">
                    <span className="font-medium">Generation 6</span>
                    <Badge
                      variant="outline"
                      className="ml-auto border-[#FBC721] text-xs text-[#FBC721]"
                    >
                      Legacy
                    </Badge>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
