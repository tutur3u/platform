'use client';

// import Canvas from './canvas';
import { Project, projects } from './data';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';
import { AnimatePresence, PanInfo, motion } from 'framer-motion';
import { Bot, Layers, LayoutGrid, Search, Smile } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

type ProjectType = 'web' | 'software' | 'hardware' | undefined;
type ProjectStatus = 'planning' | 'ongoing' | 'completed' | undefined;
type ViewMode = 'carousel' | 'grid';

export default function Projects() {
  const [type, setType] = useState<ProjectType>(undefined);
  const [status, setStatus] = useState<ProjectStatus>(undefined);

  const [viewMode, setViewMode] = useState<ViewMode>('carousel');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isUserInteracting, setIsUserInteracting] = useState(false);

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const filteredProjects = projects.filter((project) => {
    const matchesType = !type || project.type === type;
    const matchesStatus = !status || project.status === status;
    return matchesType && matchesStatus;
  });

  const nextSlide = useCallback(() => {
    if (isTransitioning || filteredProjects.length <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) =>
      prev === filteredProjects.length - 1 ? 0 : prev + 1
    );
    setTimeout(() => setIsTransitioning(false), 400);
  }, [filteredProjects.length, isTransitioning]);

  const prevSlide = useCallback(() => {
    if (isTransitioning || filteredProjects.length <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) =>
      prev === 0 ? filteredProjects.length - 1 : prev - 1
    );
    setTimeout(() => setIsTransitioning(false), 400);
  }, [filteredProjects.length, isTransitioning]);

  const goToSlide = (index: number) => {
    if (index === currentIndex || isTransitioning) return;
    setIsTransitioning(true);
    setIsUserInteracting(true);
    setCurrentIndex(index);
    setTimeout(() => {
      setIsTransitioning(false);
      setTimeout(() => setIsUserInteracting(false), 3000);
    }, 400);
  };

  const handleDragStart = () => {
    setIsUserInteracting(true);
    setIsDragging(true);
  };

  const handleDrag = (_event: any, info: PanInfo) => {
    setDragOffset(info.offset.x);
  };

  const handleDragEnd = (_event: any, info: PanInfo) => {
    const swipeThreshold = 100;
    const velocity = info.velocity.x;
    let didSwipe = false;

    if (Math.abs(velocity) > 500) {
      velocity > 0 ? prevSlide() : nextSlide();
      didSwipe = true;
    } else if (Math.abs(info.offset.x) > swipeThreshold) {
      info.offset.x > 0 ? prevSlide() : nextSlide();
      didSwipe = true;
    }

    if (didSwipe && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }

    setDragOffset(0);
    setIsDragging(false);
    setTimeout(() => setIsUserInteracting(false), 3000);
  };

  const handleTypeFilter = (newType: ProjectType) => {
    setType(newType === type ? undefined : newType);
    setCurrentIndex(0);
  };

  const handleStatusFilter = (newStatus: ProjectStatus) => {
    setStatus(newStatus === status ? undefined : newStatus);
    setCurrentIndex(0);
  };

  const clearAllFilters = () => {
    setType(undefined);
    setStatus(undefined);
    setCurrentIndex(0);
  };

  const openProjectModal = (project: Project) => {
    setProjectDetail(project);
    setIsModalOpen(true);
  };

  const closeProjectModal = () => setIsModalOpen(false);

  useEffect(() => {
    if (!isAutoScrolling || isUserInteracting || filteredProjects.length <= 1) {
      return;
    }

    const autoScrollDuration = 4000;
    const slideTimeout = setTimeout(nextSlide, autoScrollDuration);

    return () => {
      clearTimeout(slideTimeout);
    };
  }, [
    isAutoScrolling,
    isUserInteracting,
    nextSlide,
    filteredProjects.length,
    currentIndex,
  ]);

  const calculateCardStyle = (position: number) => {
    const isCenter = position === 0;
    const isVisible = Math.abs(position) <= 1;

    let x = 0;
    if (position !== 0) {
      x = position * 300;
    }

    return {
      x: x,
      y: isCenter ? 0 : 20,
      scale: isCenter ? 1 : 0.9,
      zIndex: 5 - Math.abs(position),
      opacity: isVisible ? (isCenter ? 1 : 0.7) : 0,
    };
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'grid') {
      setIsAutoScrolling(false);
    }
  };

  return (
    <>
      <motion.div
        className="relative mt-4 flex flex-col items-center text-center md:mt-28"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      >
        <div className="flex flex-col items-center text-center">
          <p className="text-4xl leading-normal font-extrabold md:text-5xl lg:text-6xl">
            <span className="text-white">NEO Culture</span>{' '}
            <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
              PROJECTS{' '}
              <motion.div
                className="inline-block"
                animate={{
                  rotate: [0, 15, -15, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Bot className="inline-block h-8 w-8 text-yellow-400 md:h-10 md:w-10 lg:h-12 lg:w-12" />
              </motion.div>
            </span>
          </p>
          <div className="mt-1 w-2/3 md:w-full">
            <p className="text-lg leading-normal font-bold text-white md:mt-4 md:max-w-2xl md:text-xl lg:text-2xl">
              The place where you can learn, grow and have fun with technology,
              by building projects.
            </p>
          </div>
        </div>

        {/* <Canvas className="absolute top-2/4 -z-10 aspect-square w-[120%] -translate-y-1/2" /> */}
      </motion.div>

      <motion.div
        className="relative mt-8 flex flex-col items-center text-center md:mt-12"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <p className="text-2xl leading-normal font-extrabold md:text-3xl lg:text-4xl">
          <span className="text-white">Our</span>{' '}
          <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
            Flagship
          </span>{' '}
          <span className="text-white">Project</span>
        </p>

        <motion.div
          className="mx-auto mt-12 max-w-6xl px-4 md:px-6 lg:px-8"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <motion.div
              className="group relative"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#F4B71A]/20 to-[#1AF4E6]/20 p-1">
                <div className="relative h-64 overflow-hidden rounded-xl md:h-80 lg:h-96">
                  <Image
                    src="/media/marketing/landing-page.jpg"
                    alt="NCT Landing Page v2 Screenshot"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#F4B71A]/10 to-[#1AF4E6]/10"></div>
                </div>
              </div>
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#F4B71A]/20 to-[#1AF4E6]/20 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"></div>
            </motion.div>

            <motion.div
              className="space-y-6"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.8 }}
            >
              <div>
                <h3 className="mb-4 text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
                  NCT <span className="text-[#5FC6E5]">Hub Platform</span>
                </h3>
                <p className="text-md leading-relaxed font-medium text-gray-300 md:text-lg">
                  The official web-based platform for RMIT Neo Culture Tech
                  based on Tuturuuu, serving as both an informative digital
                  showcase for visitors and a comprehensive management platform
                  for core team members.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-3 h-2 w-2 flex-shrink-0 rounded-full bg-[#F4B71A]"></div>
                  <p className="font-medium text-gray-400">
                    Interactive games and entertainment features including Neo
                    Chess, Neo Crush, and other engaging multiplayer
                    experiences.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-3 h-2 w-2 flex-shrink-0 rounded-full bg-[#1AF4E6]"></div>
                  <p className="font-medium text-gray-400">
                    Practical utility applications like ID scanner, time
                    tracking tools, and various productivity enhancing features.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-3 h-2 w-2 flex-shrink-0 rounded-full bg-[#F4B71A]"></div>
                  <p className="font-medium text-gray-400">
                    Comprehensive workspace management system for organizing
                    projects, managing team members, and streamlining club
                    operations.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        className="relative mt-16 flex flex-col items-center text-center md:mt-20"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <p className="text-2xl leading-normal font-extrabold md:text-3xl lg:text-4xl">
          <span className="text-white">Don't miss our</span>{' '}
          <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
            other projects
          </span>
          <span className="text-white">!</span>
        </p>

        <div className="mt-8 flex flex-col gap-6">
          <div className="flex justify-center">
            <div className="relative flex rounded-xl border border-white/20 bg-white/5 p-1 backdrop-blur-sm">
              <motion.div
                className="absolute inset-y-1 rounded-lg bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]"
                animate={{
                  x: viewMode === 'carousel' ? '2px' : 'calc(100% + 2px)',
                }}
                style={{ width: 'calc(50% - 4px)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
              <button
                onClick={() => handleViewModeChange('carousel')}
                className={`relative z-10 flex w-1/2 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  viewMode === 'carousel'
                    ? 'text-slate-900'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Layers size={16} />
                Swipe
              </button>
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`relative z-10 flex w-1/2 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  viewMode === 'grid'
                    ? 'text-slate-900'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <LayoutGrid size={16} />
                Grid
              </button>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative flex rounded-2xl border border-white/10 bg-white/5 p-1">
              <motion.div
                className="absolute inset-y-1 rounded-xl bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]"
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
                  className={`relative z-10 w-28 px-5 py-3 text-base font-bold transition-colors duration-200 ${
                    p.key === type
                      ? 'text-slate-900'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative flex rounded-2xl border border-white/10 bg-white/5 p-1">
              <motion.div
                className="absolute inset-y-1 rounded-xl bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]"
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
                  className={`relative z-10 w-28 py-3 text-base font-bold transition-colors duration-200 ${
                    p.key === 'completed' ? 'px-3' : 'px-5'
                  } ${
                    p.key === status
                      ? 'text-slate-900'
                      : 'text-white/80 hover:text-white'
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
                className="relative mx-auto max-w-screen-2xl"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <div className="relative cursor-grab active:cursor-grabbing">
                  <motion.div
                    className="flex items-center justify-center"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.1}
                    onDragStart={handleDragStart}
                    onDrag={handleDrag}
                    onDragEnd={handleDragEnd}
                    onMouseEnter={() => setIsUserInteracting(true)}
                    onMouseLeave={() => setIsUserInteracting(false)}
                    animate={{ x: isDragging ? dragOffset : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    style={{ minHeight: '500px', userSelect: 'none' }}
                  >
                    <div className="block w-full max-w-sm md:hidden">
                      {filteredProjects[currentIndex] && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{
                            opacity: 1,
                            scale: isDragging ? 0.95 : 1,
                            rotateY: isDragging ? dragOffset * 0.05 : 0,
                          }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                        >
                          <ProjectCard
                            project={filteredProjects[currentIndex]!}
                            type={type}
                            status={status}
                            isCenter={true}
                            onClick={() =>
                              openProjectModal(filteredProjects[currentIndex]!)
                            }
                          />
                        </motion.div>
                      )}
                    </div>

                    <div
                      className="relative hidden w-full items-center justify-center px-16 md:flex"
                      style={{ minHeight: '550px' }}
                    >
                      {filteredProjects.map((project, index) => {
                        const position = index - currentIndex;

                        if (Math.abs(position) > 1) return null;

                        return (
                          <motion.div
                            key={project.name}
                            className="absolute w-80"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={calculateCardStyle(position)}
                            transition={{
                              type: 'spring',
                              stiffness: 300,
                              damping: 30,
                              duration: 0.6,
                            }}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setIsUserInteracting(true);
                              if (position === 0) {
                                openProjectModal(project);
                              } else {
                                goToSlide(index);
                              }
                              setTimeout(
                                () => setIsUserInteracting(false),
                                3000
                              );
                            }}
                          >
                            <ProjectCard
                              project={project}
                              type={type}
                              status={status}
                              isCenter={position === 0}
                              onClick={() => {}}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                </div>

                {filteredProjects.length > 1 && (
                  <motion.div
                    className="mt-8 flex justify-center space-x-3"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                  >
                    {filteredProjects.map((_, index) => (
                      <motion.button
                        key={index}
                        onClick={() => goToSlide(index)}
                        className="relative"
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <div
                          className={`h-3 w-3 rounded-full transition-all duration-300 ${
                            index === currentIndex
                              ? 'scale-125 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]'
                              : 'bg-white/30 hover:bg-white/50'
                          }`}
                        />
                      </motion.button>
                    ))}
                  </motion.div>
                )}

                <motion.div
                  className="mt-6 flex justify-center"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <motion.button
                    onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                      isAutoScrolling
                        ? 'border border-white/20 bg-gradient-to-r from-[#F4B71A]/20 to-[#1AF4E6]/20 text-white'
                        : 'border border-white/10 bg-white/10 text-white/70'
                    }`}
                  >
                    {isAutoScrolling
                      ? 'Pause Auto-scroll'
                      : 'Resume Auto-scroll'}
                  </motion.button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                className="mx-auto max-w-7xl"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  {filteredProjects.map((project, index) => (
                    <motion.div
                      key={project.name}
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
                      className="cursor-pointer"
                      onClick={() => openProjectModal(project)}
                    >
                      <ProjectCard
                        project={project}
                        type={type}
                        status={status}
                        isCenter={true}
                        onClick={() => {}}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <div className="mb-6">
              <Search className="mx-auto h-16 w-16 text-yellow-400 md:h-20 md:w-20" />
            </div>
            <h3 className="mb-2 text-xl leading-normal font-extrabold md:text-4xl lg:text-5xl">
              <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
                NEOThing's
              </span>{' '}
              <span className="text-white"> Here :(</span>
            </h3>
            <p className="mb-6 flex items-center justify-center gap-2 text-lg leading-normal font-bold text-gray-400 md:text-xl lg:text-2xl">
              Try Clearing the Filters u just click{' '}
              <Smile className="h-6 w-6 text-yellow-400 md:h-8 md:w-8" />
            </p>
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] px-6 py-3 text-lg font-bold text-slate-900 transition-all duration-300 hover:scale-105 hover:shadow-lg"
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
