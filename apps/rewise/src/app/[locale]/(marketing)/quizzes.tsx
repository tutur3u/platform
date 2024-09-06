'use client';

import { Quiz } from '@/types/db';
import { cn } from '@repo/ui/lib/utils';
import React from 'react';

export interface QuizzesProps extends React.ComponentProps<'div'> {
  quizzes?: Quiz[];
}

const Quizzes = ({ className, quizzes }: QuizzesProps) => {
  return (
    <div className="relative">
      <div className={cn('pb-32 md:pt-10', className)}>
        {quizzes ? (
          <>
            <h1>Main here</h1>
          </>
        ) : (
          <h1>Empty screen</h1>
        )}
      </div>
    </div>
  );
};

export default Quizzes;
