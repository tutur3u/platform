'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function GeometricBackground() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const isDark = theme === 'dark';

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1200 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Curved flowing lines */}
        <path
          d="M-100 400C200 300 400 500 600 400C800 300 1000 500 1300 400"
          stroke={isDark ? 'rgb(147 197 253 / 0.3)' : 'rgb(59 130 246 / 0.3)'}
          strokeWidth="2"
          fill="none"
        />

        <path
          d="M-50 200C250 100 450 300 650 200C850 100 1050 300 1350 200"
          stroke={isDark ? 'rgb(196 181 253 / 0.25)' : 'rgb(147 51 234 / 0.25)'}
          strokeWidth="1.5"
          fill="none"
        />

        <path
          d="M-150 600C150 500 350 700 550 600C750 500 950 700 1250 600"
          stroke={isDark ? 'rgb(147 197 253 / 0.2)' : 'rgb(59 130 246 / 0.2)'}
          strokeWidth="1.5"
          fill="none"
        />

        {/* Large curved shape */}
        <path
          d="M0 350C100 300 200 400 300 350C400 300 500 400 600 350L600 450C500 500 400 400 300 450C200 500 100 400 0 450Z"
          fill={isDark ? 'rgb(147 197 253 / 0.05)' : 'rgb(59 130 246 / 0.05)'}
          stroke={isDark ? 'rgb(147 197 253 / 0.2)' : 'rgb(59 130 246 / 0.2)'}
          strokeWidth="1"
        />

        <path
          d="M800 150C900 100 1000 200 1100 150C1200 100 1300 200 1400 150L1400 250C1300 300 1200 200 1100 250C1000 300 900 200 800 250Z"
          fill={isDark ? 'rgb(196 181 253 / 0.05)' : 'rgb(147 51 234 / 0.05)'}
          stroke={isDark ? 'rgb(196 181 253 / 0.2)' : 'rgb(147 51 234 / 0.2)'}
          strokeWidth="1"
        />

        {/* Circles of various sizes */}
        <circle
          cx="150"
          cy="150"
          r="8"
          fill="none"
          stroke={isDark ? 'rgb(147 197 253 / 0.4)' : 'rgb(59 130 246 / 0.4)'}
          strokeWidth="2"
        />

        <circle
          cx="350"
          cy="80"
          r="12"
          fill="none"
          stroke={isDark ? 'rgb(196 181 253 / 0.3)' : 'rgb(147 51 234 / 0.3)'}
          strokeWidth="1.5"
        />

        <circle
          cx="850"
          cy="120"
          r="15"
          fill="none"
          stroke={isDark ? 'rgb(147 197 253 / 0.35)' : 'rgb(59 130 246 / 0.35)'}
          strokeWidth="2"
        />

        <circle
          cx="1050"
          cy="80"
          r="6"
          fill="none"
          stroke={isDark ? 'rgb(196 181 253 / 0.4)' : 'rgb(147 51 234 / 0.4)'}
          strokeWidth="1.5"
        />

        <circle
          cx="80"
          cy="350"
          r="4"
          fill={isDark ? 'rgb(147 197 253 / 0.3)' : 'rgb(59 130 246 / 0.3)'}
        />

        <circle
          cx="200"
          cy="650"
          r="25"
          fill="none"
          stroke={isDark ? 'rgb(147 197 253 / 0.25)' : 'rgb(59 130 246 / 0.25)'}
          strokeWidth="2"
        />

        <circle
          cx="950"
          cy="550"
          r="18"
          fill="none"
          stroke={isDark ? 'rgb(196 181 253 / 0.3)' : 'rgb(147 51 234 / 0.3)'}
          strokeWidth="1.5"
        />

        <circle
          cx="1150"
          cy="650"
          r="10"
          fill="none"
          stroke={isDark ? 'rgb(147 197 253 / 0.35)' : 'rgb(59 130 246 / 0.35)'}
          strokeWidth="2"
        />

        <circle
          cx="750"
          cy="750"
          r="8"
          fill="none"
          stroke={isDark ? 'rgb(196 181 253 / 0.25)' : 'rgb(147 51 234 / 0.25)'}
          strokeWidth="1.5"
        />

        {/* Additional flowing curves */}
        <path
          d="M600 100C700 150 800 50 900 100C1000 150 1100 50 1200 100"
          stroke={isDark ? 'rgb(147 197 253 / 0.2)' : 'rgb(59 130 246 / 0.2)'}
          strokeWidth="1"
          fill="none"
        />

        <path
          d="M100 500C200 550 300 450 400 500C500 550 600 450 700 500"
          stroke={isDark ? 'rgb(196 181 253 / 0.2)' : 'rgb(147 51 234 / 0.2)'}
          strokeWidth="1"
          fill="none"
        />

        {/* Subtle gradient overlay circles */}
        <defs>
          <radialGradient id="circleGradient" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={
                isDark ? 'rgb(147 197 253 / 0.1)' : 'rgb(59 130 246 / 0.1)'
              }
            />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <circle cx="400" cy="300" r="60" fill="url(#circleGradient)" />
        <circle cx="800" cy="400" r="80" fill="url(#circleGradient)" />
        <circle cx="300" cy="600" r="50" fill="url(#circleGradient)" />
      </svg>
    </div>
  );
}
