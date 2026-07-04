import type { HTMLAttributes, ReactNode } from 'react';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & {
  animate?: unknown;
  children?: ReactNode;
  exit?: unknown;
  initial?: unknown;
  transition?: unknown;
};

function MotionDiv({
  animate: _animate,
  exit: _exit,
  initial: _initial,
  transition: _transition,
  ...props
}: MotionDivProps) {
  return <div {...props} />;
}

export const motion = {
  div: MotionDiv,
};
