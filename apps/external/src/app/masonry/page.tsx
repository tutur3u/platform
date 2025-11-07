'use client';

import { Masonry } from '@tuturuuu/masonry';
import { useState } from 'react';

// Generate 100 items with random heights for better testing
const generateItems = (count: number) => {
  const colors = [
    'from-dynamic-blue to-dynamic-blue/80',
    'from-dynamic-cyan to-dynamic-cyan/80',
    'from-dynamic-green to-dynamic-green/80',
    'from-dynamic-yellow to-dynamic-yellow/80',
    'from-dynamic-purple to-dynamic-purple/80',
    'from-dynamic-indigo to-dynamic-indigo/80',
    'from-dynamic-orange to-dynamic-orange/80',
    'from-dynamic-gray to-dynamic-gray/80',
    'from-dynamic-red to-dynamic-red/80',
    'from-dynamic-pink to-dynamic-pink/80',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Item ${i + 1}`,
    // Vary heights significantly: 150-450px range
    height: Math.floor(Math.random() * 300) + 150,
    color: colors[i % colors.length],
  }));
};

const allItems = generateItems(100);

export default function MasonryDemo() {
  const [columns, setColumns] = useState(3);
  const [gap, setGap] = useState(16);
  const [itemCount, setItemCount] = useState(100);
  const [strategy, setStrategy] = useState<'count' | 'balanced'>('count');

  const displayItems = allItems.slice(0, itemCount);

  return (
    <div className="min-h-screen bg-linear-to-br from-dynamic-surface to-dynamic-muted p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2 font-bold text-4xl text-dynamic-foreground">
            Masonry Grid Demo
          </h1>
          <p className="text-dynamic-muted-foreground text-lg">
            A responsive Pinterest-style masonry layout component
          </p>
        </div>

        {/* Controls */}
        <div className="mb-8 rounded-lg bg-dynamic-background p-6 shadow-lg">
          <h2 className="mb-4 font-semibold text-dynamic-foreground text-xl">
            Controls
          </h2>
          <div className="grid gap-6 md:grid-cols-4">
            {/* Columns Control */}
            <div>
              <label className="mb-2 block font-medium text-dynamic-foreground text-sm">
                Columns: {columns}
              </label>
              <input
                type="range"
                min="1"
                max="6"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Gap Control */}
            <div>
              <label className="mb-2 block font-medium text-dynamic-foreground text-sm">
                Gap: {gap}px
              </label>
              <input
                type="range"
                min="4"
                max="48"
                step="4"
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Item Count Control */}
            <div>
              <label className="mb-2 block font-medium text-dynamic-foreground text-sm">
                Items: {itemCount}
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={itemCount}
                onChange={(e) => setItemCount(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Strategy Control */}
            <div>
              <label className="mb-2 block font-medium text-dynamic-foreground text-sm">
                Strategy
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStrategy('count')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                    strategy === 'count'
                      ? 'bg-dynamic-blue text-white'
                      : 'bg-dynamic-muted text-dynamic-foreground hover:bg-dynamic-muted/80'
                  }`}
                >
                  Count
                </button>
                <button
                  type="button"
                  onClick={() => setStrategy('balanced')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                    strategy === 'balanced'
                      ? 'bg-dynamic-blue text-white'
                      : 'bg-dynamic-muted text-dynamic-foreground hover:bg-dynamic-muted/80'
                  }`}
                >
                  Balanced
                </button>
              </div>
            </div>
          </div>

          {/* Strategy Info */}
          <div className="mt-4 rounded-md bg-dynamic-muted p-4">
            <p className="text-dynamic-muted-foreground text-sm">
              {strategy === 'count' ? (
                <>
                  <strong>Count Strategy:</strong> Fast distribution by item
                  count. Instant rendering with zero layout shift. Best for
                  uniform content.
                </>
              ) : (
                <>
                  <strong>Balanced Strategy:</strong> Progressive loading with
                  robust measurement validation. Items appear immediately, then
                  redistribute every 100ms as content loads. Uses dual
                  measurement system with intelligent fallbacks for optimal
                  height balance. Perfect for image galleries.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Masonry Grid */}
        <Masonry
          columns={columns}
          gap={gap}
          strategy={strategy}
          breakpoints={{
            640: 1,
            768: 2,
            1024: Math.min(3, columns),
            1280: columns,
          }}
        >
          {displayItems.map((item) => (
            <div
              key={item.id}
              className={`group relative overflow-hidden rounded-xl bg-linear-to-br ${item.color} shadow-lg transition-transform hover:scale-105`}
              style={{ height: `${item.height}px` }}
            >
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="mb-2 font-bold text-6xl text-white opacity-20">
                    {item.id}
                  </div>
                  <h3 className="font-bold text-2xl text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/80">
                    Height: {item.height}px
                  </p>
                </div>
              </div>
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
            </div>
          ))}
        </Masonry>

        {/* Features Section */}
        <div className="mt-12 rounded-lg bg-dynamic-background p-6 shadow-lg">
          <h2 className="mb-4 font-semibold text-dynamic-foreground text-xl">
            Features
          </h2>
          <ul className="space-y-2 text-dynamic-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Responsive:</strong> Automatically adjusts columns based
                on screen size
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Customizable:</strong> Control columns, gap, and
                breakpoints
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Lightweight:</strong> Zero external dependencies besides
                React
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>TypeScript:</strong> Full type safety out of the box
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Performance:</strong> Efficient column distribution
                algorithm
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Robust Validation:</strong> Validates all measurements
                with intelligent fallbacks for missing or invalid heights
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Progressive Loading:</strong> Balanced strategy shows
                content immediately, then optimizes layout with smart change
                detection
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-dynamic-green">✓</span>
              <span>
                <strong>Performance Limits:</strong> Safety limits prevent
                runaway measurements (max 50 cycles / 5 seconds)
              </span>
            </li>
          </ul>
        </div>

        {/* Code Example */}
        <div className="mt-8 rounded-lg bg-dynamic-background p-6 shadow-lg">
          <h2 className="mb-4 font-semibold text-dynamic-foreground text-xl">
            Usage Example
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-dynamic-muted p-4 text-dynamic-foreground text-sm">
            {`import { Masonry } from '@tuturuuu/masonry';

export function Gallery() {
  return (
    <Masonry
      columns={${columns}}
      gap={${gap}}
      strategy="${strategy}"
      breakpoints={{
        640: 1,
        768: 2,
        1024: 3,
        1280: 4,
      }}
    >
      {items.map((item) => (
        <div key={item.id}>
          {/* Your content here */}
        </div>
      ))}
    </Masonry>
  );
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
