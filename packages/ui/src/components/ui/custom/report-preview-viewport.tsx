'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/** Scale only the on-screen sheet; export and pagination measurement stay at A4. */
export function ReportPreviewViewport({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const parent = container.current;
    const page = sheet.current;
    if (!parent || !page) return;
    const resize = () => {
      const width = page.offsetWidth;
      if (width > 0 && parent.clientWidth > 0) {
        setScale(Math.min(1, parent.clientWidth / width));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={container}
      className="w-full min-w-0 overflow-hidden print:hidden"
    >
      <div
        ref={sheet}
        className="mx-auto flex w-[210mm] flex-col gap-6"
        style={{ zoom: scale }}
      >
        {children}
      </div>
    </div>
  );
}
