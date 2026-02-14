'use client';

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@ncthub/ui/carousel';
import { Layers, LayoutGrid, Search, Smile } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { type Project, projects } from './data';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';

type ProjectType = 'web' | 'software' | 'hardware' | undefined;
type ProjectStatus = 'planning' | 'ongoing' | 'completed' | undefined;
type ViewMode = 'carousel' | 'grid';

export default function Projects() {
  const [viewMode, setViewMode] = useState<ViewMode>('carousel');
  const [emblaApi, setEmblaApi] = useState<CarouselApi | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  const [type, setType] = useState<ProjectType>(undefined);
  const [status, setStatus] = useState<ProjectStatus>(undefined);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  const filteredProjects = projects.filter((project) => {
    const matchesType = !type || project.type === type;
    const matchesStatus = !status || project.status === status;
    return matchesType && matchesStatus;
  });

  const projectsWithNull = useMemo(
    () => [null, ...filteredProjects, null],
    [filteredProjects]
  );

  const onScroll = () => {
    if (!emblaApi) return;

    const root = emblaApi.rootNode();
    const slides = emblaApi.slideNodes();
    const slidesInView = emblaApi.slidesInView();

    if (slidesInView.length === 0) return;

    const rootRect = root.getBoundingClientRect();
    const rootCenter = rootRect.left + rootRect.width / 2;

    let closestSlide = slidesInView[0] ?? 0;
    let minDistance = Infinity;

    slidesInView.forEach((slideIndex) => {
      const slideRect = slides[slideIndex]?.getBoundingClientRect();
      if (!slideRect) return;

      const slideCenter = slideRect.left + slideRect.width / 2;
      const distance = Math.abs(slideCenter - rootCenter);

      if (distance < minDistance) {
        minDistance = distance;
        closestSlide = slideIndex;
      }
    });

    const newSelectedIndex = closestSlide;

    setSelectedIndex((selectedIndex) => {
      if (
        newSelectedIndex !== selectedIndex &&
        newSelectedIndex !== 0 &&
        newSelectedIndex !== slides.length - 1
      ) {
        return newSelectedIndex;
      }

      return selectedIndex;
    });
  };

  const onReInit = () => {
    if (!emblaApi) return;

    emblaApi.scrollTo(0);
    setSelectedIndex(1);
  };

  const handleTypeFilter = (newType: ProjectType) => {
    setType(newType === type ? undefined : newType);
    onReInit();
  };

  const handleStatusFilter = (newStatus: ProjectStatus) => {
    setStatus(newStatus === status ? undefined : newStatus);
    onReInit();
  };

  const clearAllFilters = () => {
    setType(undefined);
    setStatus(undefined);
    onReInit();
  };

  const openProjectModal = (project: Project) => {
    setProjectDetail(project);
    setIsModalOpen(true);
    setIsAutoScrolling(false);
  };

  const closeProjectModal = () => {
    setIsModalOpen(false);
    setIsAutoScrolling(true);
  };

  useEffect(() => {
    if (!emblaApi) return;

    onReInit();

    emblaApi.on('scroll', onScroll);
    emblaApi.on('reInit', onReInit);
    return () => {
      emblaApi.off('scroll', onScroll);
      emblaApi.off('reInit', onReInit);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!isAutoScrolling || !emblaApi || filteredProjects.length <= 1) return;

    const slideTimeout = setTimeout(() => {
      const nextIndex = selectedIndex % filteredProjects.length;
      emblaApi.scrollTo(nextIndex);
    }, 5000);

    return () => {
      clearTimeout(slideTimeout);
    };
  }, [isAutoScrolling, emblaApi, filteredProjects.length, selectedIndex]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'grid') {
      setIsAutoScrolling(false);
    }
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
        <p className="font-extrabold text-2xl leading-normal md:text-3xl lg:text-4xl">
          <span className="text-foreground">Don't miss our</span>{' '}
          <span className="whitespace-nowrap border-[#FBC721] border-b-4 text-[#5FC6E5]">
            other projects
          </span>
          <span className="text-foreground">!</span>
        </p>

        <div className="mt-8 flex flex-col gap-6">
          <div className="flex justify-center">
            <div className="relative flex rounded-2xl border-2 border-border/50 bg-card/80 p-1.5 shadow-lg backdrop-blur-md">
              <motion.div
                className="absolute inset-y-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-md"
                animate={{
                  x: viewMode === 'carousel' ? '3px' : 'calc(100% + 3px)',
                }}
                style={{ width: 'calc(50% - 6px)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
              <button
                onClick={() => handleViewModeChange('carousel')}
                className={`relative z-10 flex w-1/2 items-center justify-center gap-2.5 rounded-xl px-6 py-3 font-bold text-base transition-all duration-200 ${
                  viewMode === 'carousel'
                    ? 'text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:scale-105 hover:text-foreground'
                }`}
              >
                <Layers size={18} />
                Swipe
              </button>
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`relative z-10 flex w-1/2 items-center justify-center gap-2.5 rounded-xl px-6 py-3 font-bold text-base transition-all duration-200 ${
                  viewMode === 'grid'
                    ? 'text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:scale-105 hover:text-foreground'
                }`}
              >
                <LayoutGrid size={18} />
                Grid
              </button>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative flex rounded-2xl border border-border/30 bg-card/60 p-1 shadow-md backdrop-blur-sm">
              <motion.div
                className="absolute inset-y-1 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-sm"
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
                className="absolute inset-y-1 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-sm"
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

      <div className="mt-8 px-4 md:px-6 lg:px-8">
        {filteredProjects.length > 0 ? (
          <>
            {viewMode === 'carousel' ? (
              <motion.div
                className="max-w-5xl"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <Carousel setApi={setEmblaApi}>
                  <CarouselContent>
                    {projectsWithNull.map((project, index) => (
                      <CarouselItem key={index} className="basis-1/3">
                        {project && (
                          <div
                            key={index}
                            className={cn(
                              'h-full transition-all duration-500 ease-in-out',
                              index === selectedIndex
                                ? 'scale-100 opacity-100'
                                : 'scale-75 opacity-60'
                            )}
                          >
                            <ProjectCard
                              project={project}
                              type={type}
                              status={status}
                              isSelected={index === selectedIndex}
                              onClick={() => {
                                if (index === selectedIndex) {
                                  openProjectModal(project);
                                } else {
                                  emblaApi?.scrollTo(index - 1);
                                }
                              }}
                            />
                          </div>
                        )}
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>

                <div className="mt-8 flex justify-center space-x-3">
                  {projectsWithNull.map(
                    (project, index) =>
                      project && (
                        <motion.button
                          key={index}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => {
                            emblaApi?.scrollTo(index - 1);
                          }}
                        >
                          <div
                            className={`h-3 w-3 rounded-full transition-all duration-300 ${
                              index === selectedIndex
                                ? 'scale-125 bg-gradient-to-r from-blue-500 to-purple-600'
                                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                            }`}
                          />
                        </motion.button>
                      )
                  )}
                </div>

                <div className="mt-6 flex justify-center">
                  <motion.button
                    onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                    whileHover={{ scale: 1.05 }}
                    className={`rounded-xl px-4 py-2 font-medium text-sm transition-all duration-200 ${
                      isAutoScrolling
                        ? 'border border-white/20 bg-gradient-to-r from-blue-500/20 to-purple-600/20 text-foreground'
                        : 'border border-white/10 bg-white/10 text-muted-foreground'
                    }`}
                  >
                    {isAutoScrolling
                      ? 'Pause Auto-scroll'
                      : 'Resume Auto-scroll'}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
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
                    className={cn(
                      'group relative h-full w-full cursor-pointer'
                    )}
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
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <div className="mb-6">
              <Search className="mx-auto h-16 w-16 text-yellow-400 md:h-20 md:w-20" />
            </div>
            <h3 className="mb-2 font-extrabold text-xl leading-normal md:text-4xl lg:text-5xl">
              <span className="whitespace-nowrap border-[#FBC721] border-b-4 text-[#5FC6E5]">
                NEOThing's
              </span>{' '}
              <span className="text-foreground"> Here :(</span>
            </h3>
            <p className="mb-6 flex items-center justify-center gap-2 font-bold text-lg text-muted-foreground leading-normal md:text-xl lg:text-2xl">
              Try Clearing the Filters u just click{' '}
              <Smile className="h-6 w-6 text-yellow-400 md:h-8 md:w-8" />
            </p>
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 font-bold text-lg text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
            >
              Clear Filters
            </button>
          </div>
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
