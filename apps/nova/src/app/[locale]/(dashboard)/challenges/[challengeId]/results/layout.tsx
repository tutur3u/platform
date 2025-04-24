import { DEV_MODE } from '@/constants/common';
import { redirect } from 'next/navigation';
import React from 'react';

export default function ResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!DEV_MODE) redirect('/home');
  return children;
}
