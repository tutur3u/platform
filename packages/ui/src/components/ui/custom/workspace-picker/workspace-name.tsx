'use client';

import { useEffect, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

/** Truncates long names and offers the full name in a tooltip only then. */
export function WorkspaceName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setTruncated(node.scrollWidth > node.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [name]);
  const text = (
    <span ref={ref} className="block min-w-0 truncate font-medium">
      {name}
    </span>
  );
  if (!truncated) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}
