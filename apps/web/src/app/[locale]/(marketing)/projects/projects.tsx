'use client';

// ============================================================================
// IMPORTS
// ============================================================================
import Canvas from './canvas';
import { Project, projects } from './data';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';
import { AnimatePresence, PanInfo, motion } from 'framer-motion';
import { Layers, LayoutGrid } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================
type ProjectType = 'web' | 'software' | 'hardware' | undefined;
type ProjectStatus = 'planning' | 'ongoing' | 'completed' | undefined;
type ViewMode = 'carousel' | 'grid';

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function Projects() {
  // --------------------------------------------------------------------------
  // STATE - Filter State
  // --------------------------------------------------------------------------
  const [type, setType] = useState<ProjectType>(undefined);
  const [status, setStatus] = useState<ProjectStatus>(undefined);

  // --------------------------------------------------------------------------
  // STATE - View Mode State
  // --------------------------------------------------------------------------
  const [viewMode, setViewMode] = useState<ViewMode>('carousel');

  // --------------------------------------------------------------------------
  // STATE - Modal State
  // --------------------------------------------------------------------------
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  // --------------------------------------------------------------------------
  // STATE - Carousel State
  // --------------------------------------------------------------------------
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // --------------------------------------------------------------------------
  // STATE - Auto-scroll State
  // --------------------------------------------------------------------------
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [autoScrollProgress, setAutoScrollProgress] = useState(0);

  // --------------------------------------------------------------------------
  // STATE - Drag State
  // --------------------------------------------------------------------------
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // --------------------------------------------------------------------------
  // COMPUTED VALUES
  // --------------------------------------------------------------------------
  // Filter projects based on selected type and status
  const filteredProjects = projects.filter((project) => {
    const matchesType = !type || project.type === type;
    const matchesStatus = !status || project.status === status;
    return matchesType && matchesStatus;
  });

  // --------------------------------------------------------------------------
  // CAROUSEL NAVIGATION FUNCTIONS
  // --------------------------------------------------------------------------

  // Navigate to next slide with animation
  const nextSlide = useCallback(() => {
    if (isTransitioning || filteredProjects.length <= 1) return;
    setIsTransitioning(true);
    setAutoScrollProgress(0);
    setCurrentIndex((prev) =>
      prev === filteredProjects.length - 1 ? 0 : prev + 1
    );
    setTimeout(() => setIsTransitioning(false), 400); // Increased duration for smoother animation
  }, [filteredProjects.length, isTransitioning]);

  // Navigate to previous slide with animation
  const prevSlide = useCallback(() => {
    if (isTransitioning || filteredProjects.length <= 1) return;
    setIsTransitioning(true);
    setAutoScrollProgress(0);
    setCurrentIndex((prev) =>
      prev === 0 ? filteredProjects.length - 1 : prev - 1
    );
    setTimeout(() => setIsTransitioning(false), 400);
  }, [filteredProjects.length, isTransitioning]);

  // Navigate directly to a specific slide
  const goToSlide = (index: number) => {
    if (index === currentIndex || isTransitioning) return;
    setIsTransitioning(true);
    setAutoScrollProgress(0);
    setIsUserInteracting(true);
    setCurrentIndex(index);
    setTimeout(() => {
      setIsTransitioning(false);
      setTimeout(() => setIsUserInteracting(false), 3000);
    }, 400);
  };

  // --------------------------------------------------------------------------
  // DRAG HANDLER
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // FILTER HANDLERS
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // MODAL HANDLERS
  // --------------------------------------------------------------------------

  const openProjectModal = (project: Project) => {
    setProjectDetail(project);
    setIsModalOpen(true);
  };

  const closeProjectModal = () => setIsModalOpen(false);

  // --------------------------------------------------------------------------
  // AUTO-SCROLL EFFECT
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isAutoScrolling || isUserInteracting || filteredProjects.length <= 1) {
      setAutoScrollProgress(0);
      return;
    }

    let progressInterval: NodeJS.Timeout;
    const autoScrollDuration = 4000;

    progressInterval = setInterval(() => {
      setAutoScrollProgress((prev) => prev + 100 / (autoScrollDuration / 50));
    }, 50);

    const slideTimeout = setTimeout(nextSlide, autoScrollDuration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(slideTimeout);
    };
  }, [
    isAutoScrolling,
    isUserInteracting,
    nextSlide,
    filteredProjects.length,
    currentIndex,
  ]); // Added currentIndex to reset timeout on nav

  // --------------------------------------------------------------------------
  // HELPER FUNCTIONS
  // --------------------------------------------------------------------------

  // *** NEW: Helper function to calculate card styles based on position ***
  const calculateCardStyle = (position: number) => {
    const isCenter = position === 0;
    const isOffScreen = Math.abs(position) > 2;

    let x = 0;
    if (position !== 0) {
      // Reduced spacing to keep cards within viewport
      x = position * 300; // Simplified positioning - 300px spacing between cards
    }

    return {
      x: x,
      y: isCenter ? 0 : 20, // Reduced y offset
      scale: isCenter ? 1 : 0.85,
      zIndex: 5 - Math.abs(position), // Center card has highest zIndex
      opacity: isOffScreen ? 0 : 1 - Math.abs(position) * 0.3,
      // You can even add rotation for a cooler effect
      // rotate: position * 5,
    };
  };

  // --------------------------------------------------------------------------
  // VIEW MODE HANDLERS
  // --------------------------------------------------------------------------
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    // Reset auto-scroll when switching to grid
    if (mode === 'grid') {
      setIsAutoScrolling(false);
    }
  };

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------
  return (
    <>
      {/* Hero Section */}
      <div className="relative mt-96 flex flex-col items-center text-center md:mt-72">
        <div className="flex flex-col items-center text-center">
          <p className="text-4xl tracking-wider text-white md:text-6xl">
            NEO Culture Tech
          </p>
          <p className="mt-1 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-5xl font-bold tracking-widest text-transparent md:mt-6 md:text-7xl">
            PROJECTS
          </p>
          <div className="mt-1 w-2/3 md:w-full">
            <p className="text-sm font-light text-white md:mt-4 md:max-w-2xl md:text-2xl">
              The place where you can learn, grow and have fun with technology,
              by building projects.
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="mt-6 mb-4">
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

        <div className="mt-4 grid max-w-4xl grid-cols-3 gap-2 text-center">
          {[
            { key: 'web', label: 'Web Development' },
            { key: 'software', label: 'Software' },
            { key: 'hardware', label: 'Hardware' },
          ].map((p) => (
            <motion.button
              key={p.key}
              onClick={() => handleTypeFilter(p.key as ProjectType)}
              initial={false}
              animate={{
                background:
                  p.key === type
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                color: p.key === type ? '#0F172A' : '#FFFFFF',
                scale: p.key === type ? 1.05 : 1,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="rounded-xl border-2 border-[#4F4F4F] px-2 py-3 text-[0.7rem] whitespace-nowrap text-white md:text-base"
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
              onClick={() => handleStatusFilter(p.key as ProjectStatus)}
              initial={false}
              animate={{
                background:
                  p.key === status
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                color: p.key === status ? '#0F172A' : '#FFFFFF',
                scale: p.key === status ? 1.05 : 1,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="rounded-xl border-2 border-[#4F4F4F] px-2 py-3 text-[0.7rem] whitespace-nowrap text-white md:text-base"
            >
              {p.label}
            </motion.button>
          ))}
        </div>
        <Canvas className="absolute top-2/4 -z-10 aspect-square w-[120%] -translate-y-1/2" />
      </div>

      {/* Main Content */}
      <div className="mt-12 px-4 md:px-6 lg:px-8">
        {filteredProjects.length > 0 ? (
          <>
            {viewMode === 'carousel' ? (
              /* Carousel Layout */
              <div className="relative mx-auto max-w-screen-2xl">
                {/* Project Info */}
                <div className="mb-8 text-center">
                  <div className="mt-2 flex flex-col items-center justify-center gap-2">
                    <div className="flex items-center gap-2"></div>
                    {isAutoScrolling && !isUserInteracting && (
                      <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]"
                          initial={{ width: '0%' }}
                          animate={{ width: `${autoScrollProgress}%` }}
                          transition={{ duration: 0.05, ease: 'linear' }}
                        />
                      </div>
                    )}
                  </div>
                  {!isDragging && (
                    <motion.div
                      className="mt-3 flex items-center justify-center gap-2"
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    ></motion.div>
                  )}
                </div>
                {/* Carousel Container */}
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
                    {/* Mobile Carousel */}
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
                    {/* Desktop Carousel */}
                    <div className="relative hidden h-[450px] w-full items-center justify-center px-16 md:flex">
                      {filteredProjects.map((project, index) => {
                        const position = index - currentIndex;

                        // Only render a few cards around the current one for performance
                        if (Math.abs(position) > 3) return null;

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

                {/* Dot Indicators */}
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

                {/* Auto-scroll Controls */}
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
              /* Grid Layout */
              <div className="mx-auto max-w-7xl">
                {/* Project Info for Grid */}
                <div className="mb-8 text-center">
                  <p className="text-sm text-white/70 md:text-base">
                    Showing {filteredProjects.length} projects
                  </p>
                </div>

                {/* Grid Container */}
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
          /* Empty State */
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

      {/* Project Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <ProjectDetail data={projectDetail} onClose={closeProjectModal} />
        )}
      </AnimatePresence>
    </>
  );
}
