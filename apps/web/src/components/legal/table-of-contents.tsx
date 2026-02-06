'use client';

import { Check, Clock, FileText } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef, useState } from 'react';

interface TocItem {
  id: string;
  title: string;
  number: number;
}

interface TableOfContentsProps {
  items: TocItem[];
  effectiveDate: string;
}

export function TableOfContents({
  items,
  effectiveDate,
}: TableOfContentsProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const visibleSectionsRef = useRef(new Set<string>());

  useEffect(() => {
    const visibleSections = visibleSectionsRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        // Pick the first (topmost) visible section based on document order
        for (const item of items) {
          if (visibleSections.has(item.id)) {
            setActiveSection(item.id);
            return;
          }
        }
      },
      { rootMargin: '-100px 0px -66% 0px', threshold: 0 }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
      visibleSections.clear();
    };
  }, [items]);

  return (
    <Card
      className="p-6"
      style={{
        animation: 'legal-slide-in-left 0.6s ease-out 0.2s both',
      }}
    >
      <h2 className="mb-4 flex items-center font-semibold text-lg">
        <FileText className="mr-2 h-5 w-5 text-primary" />
        Table of Contents
      </h2>
      <div className="mb-3 flex items-center text-muted-foreground text-xs">
        <Clock className="mr-1 h-3 w-3" />
        <span>
          Updated:{' '}
          {new Date(effectiveDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>
      <Separator className="my-2" />
      <ScrollArea className="h-[calc(100vh-350px)]">
        <div className="space-y-1 py-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                activeSection === item.id
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <div className="flex items-center">
                <span className="mr-2 w-5 text-primary/70 text-xs">
                  {item.number.toString().padStart(2, '0')}
                </span>
                {item.title}
              </div>
              <Check
                className={cn(
                  'h-4 w-4 text-primary transition',
                  activeSection === item.id ? 'opacity-100' : 'opacity-0'
                )}
              />
            </a>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
