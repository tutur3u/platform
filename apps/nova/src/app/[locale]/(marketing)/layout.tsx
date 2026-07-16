import type React from 'react';
import Footer from '@/components/Footer';
import { createNovaPageMetadata } from '@/lib/page-metadata';
import Navbar from './navbar';

export const generateMetadata = createNovaPageMetadata({
  title: 'Learn Prompt Engineering with Interactive AI Challenges',
  description:
    'Build practical prompt engineering skills through guided lessons, interactive challenges, competitions, and AI-powered feedback.',
  pathname: '/',
});

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <div id="main-content" className="flex flex-col pt-8">
        {children}
      </div>
      <Footer />
    </>
  );
}
