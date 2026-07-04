import type { ReactNode } from 'react';

interface AnimateInViewProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function AnimateInView({ children, className, id }: AnimateInViewProps) {
  return (
    <div
      id={id}
      className={[
        'transition-all duration-500 ease-out',
        'fade-in-0 slide-in-from-bottom-3 animate-in',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
