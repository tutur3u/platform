'use client';

import { Button } from '@tuturuuu/ui/button';
import { Menu, X } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/90 py-2 shadow-md backdrop-blur-md'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-500">
            <span className="text-xl font-bold text-white">T</span>
          </div>
          <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-2xl font-bold text-transparent">
            TuPlan
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="#features"
            className="text-gray-700 transition-colors hover:text-purple-600"
          >
            Features
          </Link>
          <Link
            href="#workflow"
            className="text-gray-700 transition-colors hover:text-purple-600"
          >
            How It Works
          </Link>
          <Link
            href="#comparison"
            className="text-gray-700 transition-colors hover:text-purple-600"
          >
            vs Google Calendar
          </Link>
          <Link
            href="#benefits"
            className="text-gray-700 transition-colors hover:text-purple-600"
          >
            Benefits
          </Link>
          <Link
            href="#pricing"
            className="text-gray-700 transition-colors hover:text-purple-600"
          >
            Pricing
          </Link>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Button
            variant="outline"
            className="border-purple-600 text-purple-600"
          >
            Log in
          </Button>
          <Button className="bg-gradient-to-r from-purple-600 to-blue-500 text-white hover:from-purple-700 hover:to-blue-600">
            Get Early Access
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="text-gray-700 md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="absolute top-full right-0 left-0 flex flex-col gap-4 bg-white p-4 shadow-lg md:hidden">
          <Link
            href="#features"
            className="py-2 text-gray-700 transition-colors hover:text-purple-600"
            onClick={() => setIsMenuOpen(false)}
          >
            Features
          </Link>
          <Link
            href="#workflow"
            className="py-2 text-gray-700 transition-colors hover:text-purple-600"
            onClick={() => setIsMenuOpen(false)}
          >
            How It Works
          </Link>
          <Link
            href="#comparison"
            className="py-2 text-gray-700 transition-colors hover:text-purple-600"
            onClick={() => setIsMenuOpen(false)}
          >
            vs Google Calendar
          </Link>
          <Link
            href="#benefits"
            className="py-2 text-gray-700 transition-colors hover:text-purple-600"
            onClick={() => setIsMenuOpen(false)}
          >
            Benefits
          </Link>
          <Link
            href="#pricing"
            className="py-2 text-gray-700 transition-colors hover:text-purple-600"
            onClick={() => setIsMenuOpen(false)}
          >
            Pricing
          </Link>
          <div className="mt-2 flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full border-purple-600 text-purple-600"
            >
              Log in
            </Button>
            <Button className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white hover:from-purple-700 hover:to-blue-600">
              Get Early Access
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
