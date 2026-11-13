import type { ReactNode } from 'react';

export type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'scale';
interface RevealProps {
  children: ReactNode;
  className?: string;
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  once?: boolean;
}

/** Content is visible at first paint; decoration never gates reading. */
export function Reveal({ children, className }: RevealProps) {
  return <div className={className}>{children}</div>;
}
export function RevealGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  return <div className={className}>{children}</div>;
}
export const RevealItem = Reveal;
