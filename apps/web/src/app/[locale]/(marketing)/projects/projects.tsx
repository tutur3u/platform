'use client';

import { Project, projects } from './data';
import ProjectDetail from './project-detail';
import { Separator } from '@repo/ui/components/ui/separator';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function Projects() {
  const [type, setType] = useState<'web' | 'software' | 'hardware' | undefined>(
    undefined
  );
  const [status, setStatus] = useState<
    'completed' | 'in-progress' | 'planning' | undefined
  >(undefined);

  const [pinnedType, setPinnedType] = useState<boolean>(false);
  const [pinnedStatus, setPinnedStatus] = useState<boolean>(false);

  const [activeButtonIndex, setActiveButtonIndex] = useState<
    number | undefined
  >(undefined);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  return (
    <>
      <div className="mt-28 flex flex-col items-center md:mt-72">
        <p className="text-xl tracking-wider md:text-6xl">
          NEO Culture Tech Club
        </p>
        <p className="mt-1 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-3xl font-bold tracking-widest text-transparent md:mt-6 md:text-7xl">
          PROJECTS
        </p>
        <p className="mt-1 text-center text-xs font-light md:mt-4 md:text-2xl">
          The place where you can learn, grow and have <br /> fun with
          technology, by building projects.
        </p>
      </div>
      <div className="flex flex-col items-center pt-2 md:pt-4">
        <div className="mt-36 grid max-w-4xl grid-cols-3 gap-2 text-center md:mt-4">
          {[
            'Web Development',
            'Software',
            'Hardware',
            'Completed Projects',
            'Ongoing Projects',
            'Upcoming Projects',
          ].map((p, index) => (
            <motion.button
              key={index}
              onClick={() => {
                index === activeButtonIndex
                  ? setActiveButtonIndex(undefined)
                  : setActiveButtonIndex(index);
              }}
              initial={false}
              animate={{
                background:
                  activeButtonIndex === index
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                scale: activeButtonIndex === index ? 1.05 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
              className="rounded-xl border-2 border-[#4F4F4F] px-2 py-3 text-[0.7rem] md:text-base"
            >
              {p}
            </motion.button>
          ))}
        </div>
        <div className="my-4 grid w-full gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((member) => (
            <button
              key={member.name}
              className={`flex h-full w-full items-center justify-center rounded-lg border p-2 ${
                member.type === 'web'
                  ? 'border-blue-500/20 bg-blue-500/5 text-blue-700 hover:bg-blue-500/10 dark:border-blue-300/20 dark:bg-blue-300/5 dark:text-blue-100 dark:hover:bg-blue-300/10'
                  : member.type === 'software'
                    ? 'border-red-500/20 bg-red-500/5 text-red-700 hover:bg-red-500/10 dark:border-red-300/20 dark:bg-red-300/5 dark:text-red-100 dark:hover:bg-red-300/10'
                    : member.type === 'hardware'
                      ? 'border-pink-500/20 bg-pink-500/5 text-pink-700 hover:bg-pink-500/10 dark:border-pink-300/20 dark:bg-pink-300/5 dark:text-pink-100 dark:hover:bg-pink-300/10'
                      : ''
              } ${
                (type !== undefined && type !== member.type) ||
                (status !== undefined && status !== member.status)
                  ? 'opacity-30'
                  : ''
              } transition duration-300 hover:-translate-y-2`}
              onClick={() => {
                setProjectDetail(member);
                setIsModalOpen(true);
              }}
            >
              <div className="flex h-full w-full flex-col items-center justify-center">
                <div className="text-foreground text-center font-bold">
                  {member.name}
                </div>
                <div className="text-sm font-semibold leading-none">
                  {member.manager}
                </div>

                <Separator
                  className={`my-2 ${
                    member.type === 'web'
                      ? 'bg-blue-500/20 dark:bg-blue-300/20'
                      : member.type === 'software'
                        ? 'bg-red-500/20 dark:bg-red-300/20'
                        : member.type === 'hardware'
                          ? 'bg-pink-500/20 dark:bg-pink-300/20'
                          : ''
                  }`}
                />

                <div className="flex h-full items-center justify-center text-center text-xs font-semibold leading-none opacity-80">
                  {member.description}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {member.techStack?.map((tech) => (
                    <div
                      key={tech}
                      className={`rounded-full border px-2 py-0.5 text-center text-xs font-semibold ${
                        member.type === 'web'
                          ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
                          : member.type === 'software'
                            ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                            : member.type === 'hardware'
                              ? 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:border-pink-300/20 dark:bg-pink-300/10 dark:text-pink-300'
                              : ''
                      }`}
                    >
                      {tech}
                    </div>
                  ))}
                </div>

                <Separator
                  className={`my-2 ${
                    member.type === 'web'
                      ? 'bg-blue-500/20 dark:bg-blue-300/20'
                      : member.type === 'software'
                        ? 'bg-red-500/20 dark:bg-red-300/20'
                        : member.type === 'hardware'
                          ? 'bg-pink-500/20 dark:bg-pink-300/20'
                          : ''
                  }`}
                />

                <div
                  className={`w-full rounded border p-1 text-center text-sm font-semibold ${
                    member.type === 'web'
                      ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
                      : member.type === 'software'
                        ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                        : member.type === 'hardware'
                          ? 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:border-pink-300/20 dark:bg-pink-300/10 dark:text-pink-300'
                          : ''
                  }`}
                >
                  {member.type === 'web'
                    ? 'Web Development'
                    : member.type === 'software'
                      ? 'Software'
                      : member.type === 'hardware'
                        ? 'Hardware'
                        : 'Other'}
                </div>

                <div
                  className={`mt-2 w-full rounded border p-1 text-center text-sm font-semibold ${
                    member.status === 'completed'
                      ? 'border-green-500/20 bg-green-500/10 text-green-500 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300'
                      : member.status === 'in-progress'
                        ? 'border-purple-500/20 bg-purple-500/10 text-purple-500 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300'
                        : member.status === 'planning'
                          ? 'border-orange-500/20 bg-orange-500/10 text-orange-500 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300'
                          : ''
                  }`}
                >
                  {member.status === 'completed'
                    ? 'Completed'
                    : member.status === 'in-progress'
                      ? 'In Progress'
                      : member.status === 'planning'
                        ? 'Planning'
                        : ''}
                </div>
              </div>
            </button>
          ))}

          {isModalOpen && (
            <ProjectDetail
              data={projectDetail}
              onClose={() => {
                setIsModalOpen(false);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
