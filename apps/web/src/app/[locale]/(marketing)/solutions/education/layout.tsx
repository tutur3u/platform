import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Education Solution',
  description:
    'Empower classrooms and campuses with the Tuturuuu education suite.',
};

export default function EducationLayout({ children }: { children: ReactNode }) {
  return children;
}
