'use client';

import { slides } from './slides';
import { ThemeToggle } from '@/app/[locale]/theme-toggle';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useWindowSize } from 'react-use';

export const metadata: Metadata = {
  title: 'RMIT Jute Pest Research',
  description: 'Jute Pest',
};

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

const LogoComponent = ({
  theme,
  isCenter = false,
  className,
}: {
  theme: string;
  isCenter?: boolean;
  className?: string;
}) => {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className={cn(
        'relative',
        isCenter ? 'mb-8' : 'fixed left-8 top-8 z-50 hover:scale-110',
        className
      )}
    >
      <Link href="/">
        <Image
          src="/media/rmit-dark.png"
          width={906}
          height={406}
          alt="RMIT Logo"
          className={cn(
            'fixed left-8 top-8 transition-all duration-300',
            isCenter ? 'w-64 md:w-96' : 'w-32',
            theme !== 'dark' ? 'opacity-0' : 'opacity-100',
            'group-hover:brightness-110'
          )}
        />
        <Image
          src="/media/rmit-light.png"
          width={906}
          height={406}
          alt="RMIT Logo"
          className={cn(
            'fixed left-8 top-8 transition-all duration-300',
            isCenter ? 'w-64 md:w-96' : 'w-32',
            theme !== 'light' ? 'opacity-0' : 'opacity-100',
            'group-hover:brightness-110'
          )}
        />
      </Link>
    </motion.div>
  );
};

const SlideWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative mx-auto w-full max-w-7xl"
  >
    {children}
  </motion.div>
);

export default function JutePestResearchSlides() {
  const { height } = useWindowSize();
  const { resolvedTheme } = useTheme();

  const [[page, direction], setPage] = useState([0, 0]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);

  useEffect(() => {
    setTheme(resolvedTheme as 'dark' | 'light' | null);
  }, [resolvedTheme]);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const paginate = (newDirection: number) => {
    const newPage = page + newDirection;
    if (newPage >= 0 && newPage < slides.length) {
      setPage([newPage, newDirection]);
    }
  };

  useEffect(() => {
    const calculateScale = () => {
      if (!contentRef.current) return;

      const contentHeight = contentRef.current.scrollHeight;
      const viewportHeight = height;
      const padding = 64; // 16px top + 16px bottom padding

      if (contentHeight > viewportHeight - padding) {
        const newScale = (viewportHeight - padding) / contentHeight;
        setScale(Math.min(1, newScale));
      } else {
        setScale(1);
      }
    };

    calculateScale();
    const resizeObserver = new ResizeObserver(calculateScale);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [page, height]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        paginate(-1);
      } else if (e.key === 'ArrowRight') {
        paginate(1);
      } else if (e.key === 'f') {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen();
          setIsFullscreen(true);
        } else {
          document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [page]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-background relative flex min-h-screen flex-col items-center justify-center overflow-hidden',
        isFullscreen ? 'p-0' : 'p-8'
      )}
    >
      {theme && <LogoComponent theme={theme} />}
      <ThemeToggle
        forceDisplay={true}
        className="absolute right-4 top-4 z-50"
      />

      <button
        onClick={() => paginate(-1)}
        className={cn(
          'bg-foreground/5 hover:bg-foreground/10 absolute left-4 z-20 rounded-full p-3',
          'transform transition-all duration-300',
          'disabled:pointer-events-none disabled:opacity-0',
          'focus:ring-primary/50 hover:scale-110 focus:outline-none focus:ring-2'
        )}
        disabled={page === 0}
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      <button
        onClick={() => paginate(1)}
        className={cn(
          'bg-foreground/5 hover:bg-foreground/10 absolute right-4 z-20 rounded-full p-3',
          'transform transition-all duration-300',
          'disabled:pointer-events-none disabled:opacity-0',
          'focus:ring-primary/50 hover:scale-110 focus:outline-none focus:ring-2'
        )}
        disabled={page === slides.length - 1}
      >
        <ArrowRight className="h-6 w-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        <div className="flex gap-2">
          <TooltipProvider delayDuration={0}>
            {slides.map((slide, index) => (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setPage([index, index > page ? 1 : -1])}
                    className={cn(
                      'h-2 w-2 cursor-pointer rounded-full transition-all duration-300',
                      page === index
                        ? 'bg-primary w-6'
                        : 'bg-foreground/20 hover:bg-foreground/40'
                    )}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="pointer-events-none cursor-default text-xs"
                >
                  <p>{slide.title || `Slide ${index + 1}`}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      </div>

      <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={page}
            custom={direction}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16"
          >
            <div
              ref={contentRef}
              className="flex max-w-6xl flex-col items-center gap-12"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                transition: 'transform 0.3s ease-out',
              }}
            >
              <div className="text-center">
                <h1 className="mb-4 text-4xl font-bold md:text-5xl lg:text-6xl">
                  {slides[page]?.title}
                </h1>
                {slides[page]?.subtitle && (
                  <p className="text-foreground/80 text-xl md:text-2xl">
                    {slides[page]?.subtitle}
                  </p>
                )}
              </div>

              <SlideWrapper>
                <div className="space-y-4">{slides[page]?.content}</div>
              </SlideWrapper>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
