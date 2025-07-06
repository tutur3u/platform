'use client';

// import Canvas from './canvas';
import { Project, projects } from './data';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';
import { AnimatePresence, PanInfo, motion } from 'framer-motion';
import { Bot, Layers, LayoutGrid } from 'lucide-react';
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
      y: isCenter ? 0 : 15,
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
        transition={{ duration: 1 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <div className="flex flex-col items-center text-center">
          <p className="text-4xl leading-normal font-extrabold md:text-5xl lg:text-6xl">
            <span className="text-white">NEO Culture</span>{' '}
            <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
              PROJECTS{' '}
              <Bot className="inline-block h-8 w-8 text-yellow-400 md:h-10 md:w-10 lg:h-12 lg:w-12" />
            </span>
          </p>
          <div className="mt-1 w-2/3 md:w-full">
            <p className="text-lg leading-normal font-bold text-white md:mt-4 md:max-w-2xl md:text-xl lg:text-2xl">
              The place where you can learn, grow and have fun with technology,
              by building projects.
            </p>
          </div>
        </div>

        <div className="mt-8 mb-6">
          <div className="relative inline-flex rounded-xl border border-white/20 bg-white/5 p-1 backdrop-blur-sm">
            <motion.div
              className="absolute inset-y-1 rounded-lg bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]"
              animate={{
                x: viewMode === 'carousel' ? 0 : '100%',
                width: viewMode === 'carousel' ? '50%' : '50%',
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
            <button
              onClick={() => handleViewModeChange('carousel')}
              className={`relative z-10 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
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
              className={`relative z-10 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
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

        <div className="mt-6 flex flex-col gap-6">
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
                  width: status ? 112 : 0,
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
        {/* <Canvas className="absolute top-2/4 -z-10 aspect-square w-[120%] -translate-y-1/2" /> */}
      </motion.div>

      <div className="mt-8 px-4 md:px-6 lg:px-8">
        {filteredProjects.length > 0 ? (
          <>
            {viewMode === 'carousel' ? (
              <div className="relative mx-auto max-w-screen-2xl">
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
                    style={{ minHeight: '450px', userSelect: 'none' }}
                  >
                    <div className="block w-full max-w-sm md:hidden">
                      {filteredProjects[currentIndex] && (
                        <motion.div
                          animate={{
                            scale: isDragging ? 0.95 : 1,
                            rotateY: isDragging ? dragOffset * 0.05 : 0,
                          }}
                          transition={{ duration: 0.2 }}
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

                    <div className="relative hidden h-[450px] w-full items-center justify-center px-16 md:flex">
                      {filteredProjects.map((project, index) => {
                        const position = index - currentIndex;

                        if (Math.abs(position) > 1) return null;

                        return (
                          <motion.div
                            key={project.name}
                            className="absolute h-[400px] w-80"
                            initial={false}
                            animate={calculateCardStyle(position)}
                            transition={{
                              type: 'spring',
                              stiffness: 300,
                              damping: 30,
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
                  <div className="mt-8 flex justify-center space-x-3">
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
                  </div>
                )}

                <div className="mt-6 flex justify-center">
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
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-7xl">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  {filteredProjects.map((project, index) => (
                    <motion.div
                      key={project.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      whileHover={{ scale: 1.05 }}
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
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <div className="mb-4 text-6xl">🔍</div>
            <h3 className="mb-2 text-xl text-white md:text-2xl">
              No projects found
            </h3>
            <p className="mb-6 text-white/70">
              Try adjusting your filters to see more projects
            </p>
            <button
              onClick={clearAllFilters}
              className="text-[#1AF4E6] underline underline-offset-4 transition-colors hover:text-[#F4B71A]"
            >
              Clear all filters
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
