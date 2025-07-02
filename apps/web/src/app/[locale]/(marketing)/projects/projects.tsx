'use client';

import Canvas from './canvas';
import { Project, projects } from './data';
import ProjectCard from './project-card';
import ProjectDetail from './project-detail';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [autoScrollProgress, setAutoScrollProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');

  // Filter projects
  const filteredProjects = projects.filter((project) => {
    const matchesType = !type || project.type === type;
    const matchesStatus = !status || project.status === status;
    return matchesType && matchesStatus;
  });

  // Carousel functions with animation
  const nextSlide = useCallback(() => {
    setIsTransitioning(true);
    setAutoScrollProgress(0);
    setSlideDirection('right');
    setTimeout(() => {
      setCurrentIndex((prev) =>
        prev === filteredProjects.length - 1 ? 0 : prev + 1
      );
      setTimeout(() => setIsTransitioning(false), 300);
    }, 100);
  }, [filteredProjects.length]);

  const prevSlide = useCallback(() => {
    setIsTransitioning(true);
    setAutoScrollProgress(0);
    setSlideDirection('left');
    setTimeout(() => {
      setCurrentIndex((prev) =>
        prev === 0 ? filteredProjects.length - 1 : prev - 1
      );
      setTimeout(() => setIsTransitioning(false), 300);
    }, 100);
  }, [filteredProjects.length]);

  const goToSlide = (index: number) => {
    setIsTransitioning(true);
    setAutoScrollProgress(0);
    setIsUserInteracting(true);
    setSlideDirection(index > currentIndex ? 'right' : 'left');
    setTimeout(() => {
      setCurrentIndex(index);
      setTimeout(() => {
        setIsTransitioning(false);
        setTimeout(() => setIsUserInteracting(false), 3000); // Resume auto-scroll after 3 seconds
      }, 300);
    }, 100);
  };

  // Auto-scroll functionality with animated progress
  useEffect(() => {
    if (!isAutoScrolling || isUserInteracting || filteredProjects.length <= 1) {
      setAutoScrollProgress(0);
      return;
    }

    let progressInterval: NodeJS.Timeout;
    let slideInterval: NodeJS.Timeout;

    // Progress animation (updates every 50ms for smooth animation)
    progressInterval = setInterval(() => {
      setAutoScrollProgress(prev => {
        if (prev >= 100) return 0;
        return prev + (100 / (4000 / 50)); // 4 seconds total
      });
    }, 50);

    // Slide change animation
    slideInterval = setInterval(() => {
      setIsTransitioning(true);
      setAutoScrollProgress(0);
      
      // Add a slight delay for transition effect
      setTimeout(() => {
        nextSlide();
        setTimeout(() => setIsTransitioning(false), 300);
      }, 100);
    }, 4000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(slideInterval);
      setAutoScrollProgress(0);
    };
  }, [isAutoScrolling, isUserInteracting, nextSlide, filteredProjects.length]);

  // Handle swipe
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => {
    setIsUserInteracting(true);
    setIsDragging(true);
  };

  const handleDrag = (event: any, info: PanInfo) => {
    setDragOffset(info.offset.x);
  };

  const handleDragEnd = (event: any, info: PanInfo) => {
    const swipeThreshold = 100;
    const velocity = info.velocity.x;
    let didSwipe = false;
    
    // Check velocity for quick swipes
    if (Math.abs(velocity) > 500) {
      if (velocity > 0) {
        prevSlide();
        didSwipe = true;
      } else {
        nextSlide();
        didSwipe = true;
      }
    } else if (Math.abs(info.offset.x) > swipeThreshold) {
      // Check offset for slower drags
      if (info.offset.x > 0) {
        prevSlide();
        didSwipe = true;
      } else {
        nextSlide();
        didSwipe = true;
      }
    }
    
    // Haptic feedback on successful swipe (mobile)
    if (didSwipe && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }
    
    setDragOffset(0);
    setIsDragging(false);
    setTimeout(() => setIsUserInteracting(false), 3000);
  };

  // Get visible card indices (show 3 cards on desktop, 1 on mobile)
  const getVisibleCards = () => {
    const cardsToShow = window.innerWidth >= 768 ? 3 : 1;
    const cards = [];
    
    for (let i = 0; i < cardsToShow; i++) {
      const index = (currentIndex - Math.floor(cardsToShow / 2) + i + filteredProjects.length) % filteredProjects.length;
      cards.push(index);
    }
    
    return cards;
  };

  return (
    <>
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

        <div className="mt-4 grid max-w-4xl grid-cols-3 gap-2 text-center">
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
                setCurrentIndex(0); // Reset to first slide when filter changes
              }}
              initial={false}
              animate={{
                background:
                  p.key === type
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                color: p.key === type ? '#0F172A' : '',
                scale: p.key === type ? 1.05 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
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
              onClick={() => {
                p.key === status
                  ? setStatus(undefined)
                  : setStatus(p.key as 'planning' | 'ongoing' | 'completed');
                setCurrentIndex(0); // Reset to first slide when filter changes
              }}
              initial={false}
              animate={{
                background:
                  p.key === status
                    ? 'linear-gradient(to right, #F4B71A 40%, #1AF4E6 100%)'
                    : 'transparent',
                color: p.key === status ? '#0F172A' : '',
                scale: p.key === status ? 1.05 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
              className="rounded-xl border-2 border-[#4F4F4F] px-2 py-3 text-[0.7rem] whitespace-nowrap text-white md:text-base"
            >
              {p.label}
            </motion.button>
          ))}
        </div>

        <Canvas className="absolute top-2/4 -z-10 aspect-square w-[120%] -translate-y-1/2" />
      </div>

      {/* Carousel Section */}
      <div className="mt-12 px-4 md:px-6 lg:px-8">
        {filteredProjects.length > 0 ? (
          <div className="relative max-w-7xl mx-auto">
            {/* Project Count */}
            <div className="text-center mb-8">
              <p className="text-white/70 text-sm md:text-base">
                {currentIndex + 1} of {filteredProjects.length} projects
              </p>
              {/* Auto-scroll indicator with progress */}
              <div className="flex flex-col items-center justify-center gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${isAutoScrolling && !isUserInteracting ? 'bg-[#1AF4E6]' : 'bg-white/30'}`} />
                  <span className="text-xs text-white/50">
                    {isAutoScrolling && !isUserInteracting ? 'Auto-scrolling' : 'Paused'}
                  </span>
                </div>
                
                {/* Animated Progress Bar */}
                {isAutoScrolling && !isUserInteracting && (
                  <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] rounded-full"
                      style={{ width: `${autoScrollProgress}%` }}
                      initial={{ width: '0%' }}
                      animate={{ width: `${autoScrollProgress}%` }}
                      transition={{ duration: 0.05, ease: 'linear' }}
                    />
                  </div>
                )}
              </div>
              {/* Drag hint */}
              {!isDragging && (
                <motion.div 
                  className="flex items-center justify-center gap-2 mt-3"
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <span className="text-xs text-white/40">👆 Drag to browse projects</span>
                </motion.div>
              )}
            </div>

            {/* Carousel Container */}
            <div className="relative overflow-hidden cursor-grab active:cursor-grabbing">
              {/* Transition overlay effect */}
              {isTransitioning && (
                <>
                  <motion.div
                    className="absolute inset-0 z-30 bg-gradient-to-r from-[#F4B71A]/20 via-transparent to-[#1AF4E6]/20 pointer-events-none"
                    initial={{ opacity: 0, x: '-100%' }}
                    animate={{ opacity: [0, 0.5, 0], x: ['100%', '0%', '-100%'] }}
                    transition={{ duration: 0.6, ease: 'easeInOut' }}
                  />
                  
                  {/* Sparkle effects */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] rounded-full z-30 pointer-events-none"
                      style={{
                        left: `${20 + i * 12}%`,
                        top: `${30 + (i % 2) * 40}%`,
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: [0, 1, 0],
                        opacity: [0, 1, 0],
                        rotate: [0, 180, 360]
                      }}
                      transition={{ 
                        duration: 0.8,
                        delay: i * 0.1,
                        ease: 'easeInOut'
                      }}
                    />
                  ))}
                </>
              )}
              
              <motion.div
                className="flex items-center justify-center gap-4 md:gap-8"
                drag="x"
                dragConstraints={{ left: -200, right: 200 }}
                dragElastic={0.1}
                onDragStart={handleDragStart}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => setIsUserInteracting(true)}
                onMouseLeave={() => setIsUserInteracting(false)}
                animate={{ 
                  x: isDragging ? dragOffset : 0,
                  scale: isDragging ? 0.98 : (isTransitioning ? 0.95 : 1),
                  opacity: isTransitioning ? 0.8 : 1
                }}
                transition={{ 
                  type: "spring", 
                  stiffness: 300, 
                  damping: 30,
                  duration: isDragging ? 0 : (isTransitioning ? 0.3 : 0.5)
                }}
                style={{ 
                  minHeight: '450px',
                  userSelect: 'none'
                }}
              >
                {/* Mobile: Show only current card */}
                <div className="block md:hidden w-full max-w-sm">
                  {filteredProjects[currentIndex] && (
                    <motion.div
                      animate={{ 
                        scale: isDragging ? 0.95 : 1,
                        rotateY: isDragging ? dragOffset * 0.05 : 0
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <ProjectCard
                        project={filteredProjects[currentIndex]!}
                        type={type}
                        status={status}
                        isCenter={true}
                        onClick={() => {
                          setProjectDetail(filteredProjects[currentIndex]!);
                          setIsModalOpen(true);
                        }}
                      />
                    </motion.div>
                  )}
                </div>

                {/* Desktop: Show 3 cards */}
                <div className="hidden md:flex items-center justify-center gap-8">
                  {/* Previous card */}
                  <div className="w-80 opacity-60 scale-90 transition-all duration-300">
                    {filteredProjects.length > 0 && (
                      <ProjectCard
                        project={filteredProjects[(currentIndex - 1 + filteredProjects.length) % filteredProjects.length]!}
                        type={type}
                        status={status}
                        isCenter={false}
                        onClick={() => {
                          prevSlide();
                          setIsUserInteracting(true);
                          setTimeout(() => setIsUserInteracting(false), 3000);
                        }}
                      />
                    )}
                  </div>

                  {/* Current card (center) with slide animation */}
                  <div className="w-80 scale-100 transition-all duration-300 z-10 relative h-[400px]">
                    <AnimatePresence initial={false} custom={slideDirection}>
                      {filteredProjects[currentIndex] && (
                        <motion.div
                          key={filteredProjects[currentIndex]!.name}
                          custom={slideDirection}
                          initial={{ x: slideDirection === 'right' ? 300 : -300, opacity: 0, scale: 0.95 }}
                          animate={{ x: 0, opacity: 1, scale: 1 }}
                          exit={{ x: slideDirection === 'right' ? -300 : 300, opacity: 0, scale: 0.95 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 40, duration: 0.4 }}
                          className="absolute w-full h-full"
                        >
                          <ProjectCard
                            project={filteredProjects[currentIndex]!}
                            type={type}
                            status={status}
                            isCenter={true}
                            onClick={() => {
                              setProjectDetail(filteredProjects[currentIndex]!);
                              setIsModalOpen(true);
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Next card */}
                  <div className="w-80 opacity-60 scale-90 transition-all duration-300">
                    {filteredProjects.length > 0 && (
                      <ProjectCard
                        project={filteredProjects[(currentIndex + 1) % filteredProjects.length]!}
                        type={type}
                        status={status}
                        isCenter={false}
                        onClick={() => {
                          nextSlide();
                          setIsUserInteracting(true);
                          setTimeout(() => setIsUserInteracting(false), 3000);
                        }}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Navigation Arrows */}
            {filteredProjects.length > 1 && (
              <>
                <button
                  onClick={() => {
                    prevSlide();
                    setIsUserInteracting(true);
                    setTimeout(() => setIsUserInteracting(false), 3000);
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20 transition-all duration-200 hover:scale-110"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={() => {
                    nextSlide();
                    setIsUserInteracting(true);
                    setTimeout(() => setIsUserInteracting(false), 3000);
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20 transition-all duration-200 hover:scale-110"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {/* Enhanced Dot Indicators */}
            {filteredProjects.length > 1 && (
              <div className="flex justify-center space-x-3 mt-8">
                {filteredProjects.map((_, index) => (
                  <motion.button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className="relative"
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {/* Base dot */}
                    <div
                      className={`w-3 h-3 rounded-full transition-all duration-300 ${
                        index === currentIndex
                          ? 'bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] scale-125'
                          : 'bg-white/30 hover:bg-white/50'
                      }`}
                    />
                    
                    {/* Active dot progress ring */}
                    {index === currentIndex && isAutoScrolling && !isUserInteracting && (
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-[#1AF4E6]/60"
                        initial={{ scale: 1, opacity: 0.6 }}
                        animate={{ 
                          scale: [1, 1.8, 1],
                          opacity: [0.6, 0, 0.6]
                        }}
                        transition={{ 
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut'
                        }}
                      />
                    )}
                    
                    {/* Transition pulse effect */}
                    {index === currentIndex && isTransitioning && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]"
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.6 }}
                      />
                    )}
                  </motion.button>
                ))}
              </div>
            )}

            {/* Auto-scroll toggle */}
            <div className="flex justify-center mt-6">
              <motion.button
                onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isAutoScrolling
                    ? 'bg-gradient-to-r from-[#F4B71A]/20 to-[#1AF4E6]/20 text-white border border-white/20'
                    : 'bg-white/10 text-white/70 border border-white/10'
                }`}
              >
                {isAutoScrolling ? '⏸️ Pause Auto-scroll' : '▶️ Resume Auto-scroll'}
              </motion.button>
            </div>

            {/* Floating progress circle during auto-scroll */}
            {isAutoScrolling && !isUserInteracting && (
              <motion.div
                className="fixed top-20 right-6 z-40"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <div className="relative w-12 h-12">
                  {/* Background circle */}
                  <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/20" />
                  
                  {/* Progress circle */}
                  <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="2"
                    />
                    <motion.circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="url(#gradient)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 20}`}
                      strokeDashoffset={`${2 * Math.PI * 20 * (1 - autoScrollProgress / 100)}`}
                      transition={{ duration: 0.05, ease: 'linear' }}
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F4B71A" />
                        <stop offset="100%" stopColor="#1AF4E6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  
                  {/* Center icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/80 text-xs">⏱️</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl md:text-2xl text-white mb-2">No projects found</h3>
            <p className="text-white/70 mb-6">Try adjusting your filters to see more projects</p>
            <button
              onClick={() => {
                setType(undefined);
                setStatus(undefined);
                setCurrentIndex(0);
              }}
              className="text-[#1AF4E6] hover:text-[#F4B71A] transition-colors underline underline-offset-4"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

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
    </>
  );
}
