'use client';

import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface LessonSection {
  title: string;
  content: string | string[];
}

interface LessonProps {
  lesson?: {
    title: string;
    sections: LessonSection[];
  };
}

export function LessonContent({ lesson }: LessonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));

            if (!isNaN(index)) {
              setActiveSection(index);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0,
        rootMargin: '0px 0px -100% 0px',
      }
    );

    document.querySelectorAll('[data-index]').forEach((section) => {
      observer.observe(section);
    });

    return () => observer.disconnect();
  }, [lesson]);

  // If no lesson data is provided, show a loading state
  if (!lesson) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <p className="text-muted-foreground">Loading lesson content...</p>
      </div>
    );
  }

  // If there are no sections, show an empty state
  if (!lesson.sections || lesson.sections.length === 0) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <p className="text-muted-foreground">No content available</p>
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-6">
      {/* Table of Contents Sidebar */}
      <div className="w-64 py-4">
        <h2 className="p-2 text-sm font-semibold">Table of Contents</h2>
        <nav className="space-y-1">
          {lesson.sections.map((section, index) => (
            <button
              key={index}
              onClick={() => {
                setActiveSection(index);
                document
                  .querySelector(`[data-index="${index}"]`)
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={cn(
                'hover:bg-accent w-full rounded px-2 py-1 text-left text-sm transition-colors',
                activeSection === index
                  ? 'bg-accent text-primary font-medium'
                  : 'text-muted-foreground'
              )}
            >
              {section.title}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="relative flex-1">
        <ScrollArea ref={containerRef} className="h-[calc(100vh-6rem)]">
          <div className="p-4">
            <div className="mb-4 py-2">
              <h1 className="text-4xl font-bold tracking-tight">
                {lesson.title}
              </h1>
            </div>
            {lesson.sections.map((section, index) => (
              <motion.div
                key={index}
                data-index={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="space-y-4"
              >
                <h2 className="text-2xl font-semibold tracking-tight">
                  {section.title}
                </h2>
                {Array.isArray(section.content) ? (
                  <div className="space-y-4">
                    {section.content.map((item, idx) => {
                      const hasIndentation = item.startsWith('\t');
                      const content = hasIndentation ? item.substring(1) : item;

                      return (
                        <p
                          key={idx}
                          className={cn(
                            'text-muted-foreground whitespace-pre-line text-lg leading-relaxed',
                            hasIndentation && 'pl-8'
                          )}
                        >
                          {item}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground whitespace-pre-line text-lg leading-relaxed">
                    {section.content}
                  </p>
                )}
                {index < lesson.sections.length - 1 && (
                  <Separator className="my-8" />
                )}
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
