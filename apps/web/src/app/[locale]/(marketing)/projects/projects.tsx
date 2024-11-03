'use client';

import { Project, projects } from './data';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

export default function Projects() {
  const [type, setType] = useState<'web' | 'software' | 'hardware' | undefined>(
    undefined
  );
  const [status, setStatus] = useState<
    'planning' | 'ongoing' | 'completed' | undefined
  >(undefined);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  return (
    <>
      <div className="mt-[9.5rem] flex flex-col items-center md:mt-72">
        <p className="text-xl tracking-wider text-white sm:text-3xl md:text-6xl">
          NEO Culture Tech
        </p>
        <p className="mt-1 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-4xl font-bold tracking-widest text-transparent md:mt-6 md:text-7xl">
          PROJECTS
        </p>
        <div className="mt-1 w-2/3 md:w-full">
          <p className="text-center text-sm font-light text-white md:mt-4 md:max-w-2xl md:text-2xl">
            The place where you can learn, grow and have fun with technology,
            by building projects.
          </p>
        </div>
      </div>
      <div className="mt-0 flex flex-col items-center pt-2 md:pt-4">
        <div className="mt-20 grid max-w-4xl grid-cols-3 gap-2 text-center md:mt-4">
          {[
            { key: 'web', label: 'Web Development' },
            { key: 'software', label: 'Software' },
            { key: 'hardware', label: 'Hardware' },
          ].map((p) => (
            <motion.button
              key={p.key}
              onClick={() => {
                p.key === type
                  ? setType(undefined)
                  : setType(p.key as 'web' | 'software' | 'hardware');
              }}
              initial={false}
              animate={{
                background:
                  p.key === type
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                scale: p.key === type ? 1.05 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
              className="whitespace-nowrap rounded-xl border-2 border-[#4F4F4F] px-2 py-3 text-[0.7rem] text-white md:text-base"
            >
              {p.label}
            </motion.button>
          ))}
          {[
            { key: 'planning', label: 'Planning Projects' },
            { key: 'ongoing', label: 'Ongoing Projects' },
            { key: 'completed', label: 'Completed Projects' },
          ].map((p) => (
            <motion.button
              key={p.key}
              onClick={() => {
                p.key === status
                  ? setStatus(undefined)
                  : setStatus(p.key as 'planning' | 'ongoing' | 'completed');
              }}
              initial={false}
              animate={{
                background:
                  p.key === status
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                scale: p.key === status ? 1.05 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
              className="whitespace-nowrap rounded-xl border-2 border-[#4F4F4F] px-2 py-3 text-[0.7rem] text-white md:text-base"
            >
              {p.label}
            </motion.button>
          ))}
        </div>
        <div className="mt-6 flex flex-col items-center gap-6 md:grid md:grid-cols-2 md:gap-8 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.name}
              project={project}
              type={type}
              status={status}
              onClick={() => {
                setProjectDetail(project);
                setIsModalOpen(true);
              }}
            />
          ))}
          <AnimatePresence>
            {isModalOpen && (
              <ProjectDetail
                data={projectDetail}
                onClose={() => {
                  setIsModalOpen(false);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
