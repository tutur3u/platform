'use client';

import { Masonry } from '@tuturuuu/masonry';
import { useState } from 'react';

// Sample data with varying heights to demonstrate masonry layout
const sampleItems = [
  {
    id: 1,
    title: 'Mountain Vista',
    height: 300,
    color: 'from-blue-400 to-blue-600',
  },
  {
    id: 2,
    title: 'Ocean Waves',
    height: 200,
    color: 'from-cyan-400 to-cyan-600',
  },
  {
    id: 3,
    title: 'Forest Path',
    height: 400,
    color: 'from-green-400 to-green-600',
  },
  {
    id: 4,
    title: 'Desert Dunes',
    height: 250,
    color: 'from-yellow-400 to-yellow-600',
  },
  {
    id: 5,
    title: 'City Lights',
    height: 350,
    color: 'from-purple-400 to-purple-600',
  },
  {
    id: 6,
    title: 'Northern Lights',
    height: 280,
    color: 'from-indigo-400 to-indigo-600',
  },
  {
    id: 7,
    title: 'Sunset Beach',
    height: 320,
    color: 'from-orange-400 to-orange-600',
  },
  {
    id: 8,
    title: 'Snowy Peaks',
    height: 220,
    color: 'from-slate-400 to-slate-600',
  },
  {
    id: 9,
    title: 'Tropical Paradise',
    height: 380,
    color: 'from-emerald-400 to-emerald-600',
  },
  {
    id: 10,
    title: 'Starry Night',
    height: 260,
    color: 'from-violet-400 to-violet-600',
  },
  {
    id: 11,
    title: 'Canyon Views',
    height: 340,
    color: 'from-red-400 to-red-600',
  },
  {
    id: 12,
    title: 'Misty Morning',
    height: 290,
    color: 'from-gray-400 to-gray-600',
  },
];

export default function MasonryDemo() {
  const [columns, setColumns] = useState(3);
  const [gap, setGap] = useState(16);
  const [itemCount, setItemCount] = useState(12);

  const displayItems = sampleItems.slice(0, itemCount);

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
          <div className="grid gap-6 md:grid-cols-3">
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
                min="3"
                max="12"
                value={itemCount}
                onChange={(e) => setItemCount(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Masonry Grid */}
        <Masonry
          columns={columns}
          gap={gap}
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
