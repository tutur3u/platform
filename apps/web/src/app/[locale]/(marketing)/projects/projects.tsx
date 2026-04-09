'use client';

import { Badge } from '@ncthub/ui/badge';
import { Sparkles } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { type Project, projects } from './data';
import EmptyState from './empty-state';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';

type ProjectType = 'web' | 'software' | 'hardware' | undefined;
type ProjectStatus = 'planning' | 'ongoing' | 'completed' | undefined;

export default function Projects() {
  const [type, setType] = useState<ProjectType>(undefined);
  const [status, setStatus] = useState<ProjectStatus>(undefined);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesType = !type || project.type === type;
        const matchesStatus = !status || project.status === status;
        return matchesType && matchesStatus;
      }),
    [type, status]
  );

  const handleTypeFilter = (newType: ProjectType) => {
    setType(newType === type ? undefined : newType);
  };

  const handleStatusFilter = (newStatus: ProjectStatus) => {
    setStatus(newStatus === status ? undefined : newStatus);
  };

  const clearAllFilters = () => {
    setType(undefined);
    setStatus(undefined);
  };

  const openProjectModal = (project: Project) => {
    setProjectDetail(project);
    setIsModalOpen(true);
  };

  const closeProjectModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <motion.div
        className="relative mt-16 flex flex-col items-center text-center md:mt-20"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="mb-6 inline-flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-brand-light-yellow" />
          <Badge
            variant="outline"
            className="border-brand-light-blue/50 px-4 py-2 text-base text-brand-light-blue"
          >
            Our Projects
          </Badge>
          <Sparkles className="h-6 w-6 text-brand-light-yellow" />
        </div>

        <p className="font-extrabold text-2xl leading-normal md:text-3xl lg:text-4xl">
          <span className="text-foreground">Don't miss our</span>{' '}
          <span className="whitespace-nowrap border-brand-light-yellow border-b-4 text-brand-light-blue">
            other projects
          </span>
          <span className="text-foreground">!</span>
        </p>

        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Explore the diverse range of projects our members have been building
        </p>

        <div className="mt-8 flex flex-col gap-6">
          <div className="flex justify-center">
            <div className="relative flex rounded-2xl border border-border/30 bg-card/60 p-1 shadow-md backdrop-blur-sm">
              <motion.div
                className="absolute inset-y-1 rounded-xl bg-linear-to-r from-brand-light-blue to-dynamic-cyan shadow-sm"
                animate={{
                  x:
                    type === 'web'
                      ? 0
                      : type === 'software'
                        ? 112
                        : type === 'hardware'
                          ? 224
                          : 0,
                  width: type ? 112 : 0,
                  opacity: type ? 1 : 0,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
              {[
                { key: 'web', label: 'Web' },
                { key: 'software', label: 'Software' },
                { key: 'hardware', label: 'Hardware' },
              ].map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => handleTypeFilter(p.key as ProjectType)}
                  className={`relative z-10 w-28 px-5 py-3 font-bold text-base transition-all duration-200 ${
                    p.key === type
                      ? 'text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:scale-105 hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative flex rounded-2xl border border-border/30 bg-card/60 p-1 shadow-md backdrop-blur-sm">
              <motion.div
                className="absolute inset-y-1 rounded-xl bg-linear-to-r from-brand-light-blue to-dynamic-cyan shadow-sm"
                animate={{
                  x:
                    status === 'planning'
                      ? 0
                      : status === 'ongoing'
                        ? 112
                        : status === 'completed'
                          ? 220
                          : -200,
                  width: status ? 115 : 0,
                  opacity: status ? 1 : 0,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
              {[
                { key: 'planning', label: 'Planning' },
                { key: 'ongoing', label: 'Ongoing' },
                { key: 'completed', label: 'Completed' },
              ].map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => handleStatusFilter(p.key as ProjectStatus)}
                  className={`relative z-10 w-28 py-3 font-bold text-base transition-all duration-200 ${
                    p.key === 'completed' ? 'px-3' : 'px-5'
                  } ${
                    p.key === status
                      ? 'text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:scale-105 hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="relative mt-8 rounded-3xl bg-background/60 p-6 md:p-8">
        {filteredProjects.length > 0 ? (
          <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: 'easeOut',
                  type: 'spring',
                  stiffness: 100,
                }}
                whileHover={{
                  scale: 1.05,
                  y: -5,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.95 }}
                className={cn('group relative h-full w-full cursor-pointer')}
              >
                <ProjectCard
                  project={project}
                  type={type}
                  status={status}
                  isSelected={true}
                  onClick={() => openProjectModal(project)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState onClearFilters={clearAllFilters} />
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <ProjectDetail data={projectDetail} onClose={closeProjectModal} />
        )}
      </AnimatePresence>
    </>
  );
}
