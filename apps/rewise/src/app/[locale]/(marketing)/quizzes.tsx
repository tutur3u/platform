'use client';

import { Model, defaultModel } from '@/data/models';
import { Quiz } from '@/types/db';
import { createClient } from '@/utils/supabase/client';
import { useChat } from '@ai-sdk/react';
import { toast } from '@repo/ui/hooks/use-toast';
import { cn } from '@repo/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

export interface QuizzesProps extends React.ComponentProps<'div'> {
  locale: string;
  quizzes?: Quiz[];
}

const Quizzes = ({ className, locale, quizzes }: QuizzesProps) => {
  const t = useTranslations('ai_chat');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
