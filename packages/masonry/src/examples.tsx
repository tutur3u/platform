import { Masonry } from '@tuturuuu/masonry';
import type { ReactNode } from 'react';

// Example 1: Basic Usage - Fixed Columns (v0.3.0+)
export function BasicExample() {
  return (
    <Masonry columns={3} gap={16}>
      <div className="rounded-lg bg-dynamic-blue p-4">Item 1</div>
      <div className="rounded-lg bg-dynamic-green p-4">Item 2</div>
      <div className="rounded-lg bg-dynamic-red p-4">Item 3</div>
    </Masonry>
  );
}

// Example 1b: Fixed 4 Columns (v0.3.0 fix - no more single column bug)
export function FixedColumnsExample() {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    color: ['blue', 'green', 'red', 'purple', 'orange', 'cyan'][i % 6],
  }));

  return (
    <Masonry columns={4} gap={16}>
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-lg bg-dynamic-${item.color} p-6`}
        >
          Item {item.id + 1}
        </div>
      ))}
    </Masonry>
  );
}

// Example 2: Image Gallery
interface Image {
  id: number;
  url: string;
  title: string;
}

export function ImageGallery({ images }: { images: Image[] }) {
  return (
    <Masonry
      columns={4}
      gap={12}
      breakpoints={{
        640: 1,
        768: 2,
        1024: 3,
        1280: 4,
      }}
    >
      {images.map((image) => (
        <div key={image.id} className="overflow-hidden rounded-lg">
          <img src={image.url} alt={image.title} className="h-auto w-full" />
        </div>
      ))}
    </Masonry>
  );
}

// Example 3: Card Grid
interface CardProps {
  title: string;
  description: string;
  children?: ReactNode;
}

function Card({ title, description, children }: CardProps) {
  return (
    <div className="rounded-lg bg-dynamic-background p-6 shadow-lg">
      <h3 className="mb-2 font-bold text-dynamic-foreground text-xl">
        {title}
      </h3>
      <p className="text-dynamic-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

export function CardGrid({ cards }: { cards: CardProps[] }) {
  return (
    <Masonry columns={3} gap={20}>
      {cards.map((card, index) => (
        <Card key={index} {...card} />
      ))}
    </Masonry>
  );
}

// Example 4: Dynamic Content with Balanced Strategy
export function DynamicMasonry() {
  const items = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    height: Math.floor(Math.random() * 200) + 100,
  }));

  return (
    <Masonry columns={4} gap={16} strategy="balanced">
      {items.map((item) => (
        <div
          key={item.id}
          style={{ height: `${item.height}px` }}
          className="flex items-center justify-center rounded-lg bg-dynamic-muted"
        >
          <span className="text-dynamic-foreground">#{item.id}</span>
        </div>
      ))}
    </Masonry>
  );
}

// Example 5: Performance Example with 100+ items
export function PerformanceExample() {
  const items = Array.from({ length: 120 }, (_, i) => ({
    id: i,
    height: Math.floor(Math.random() * 150) + 80,
  }));

  return (
    <Masonry columns={5} gap={12} strategy="count">
      {items.map((item) => (
        <div
          key={item.id}
          style={{ height: `${item.height}px` }}
          className="flex items-center justify-center rounded-lg border border-dynamic-border bg-dynamic-background text-dynamic-foreground"
        >
          #{item.id + 1}
        </div>
      ))}
    </Masonry>
  );
}

// Example 6: Smooth Transitions Example
export function SmoothTransitionsExample() {
  const items = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    height: [120, 180, 150, 200][i % 4],
  }));

  return (
    <Masonry
      columns={4}
      gap={16}
      strategy="balanced"
      smoothTransitions={true}
      balanceThreshold={0.05}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{ height: `${item.height}px` }}
          className="flex items-center justify-center rounded-lg bg-dynamic-accent text-white"
        >
          Item {item.id + 1}
        </div>
      ))}
    </Masonry>
  );
}

// Example 7: Custom Balance Threshold
export function CustomThresholdExample() {
  const items = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    height: Math.floor(Math.random() * 180) + 100,
  }));

  return (
    <Masonry
      columns={3}
      gap={20}
      strategy="balanced"
      balanceThreshold={0.1} // Higher threshold = more tolerance for imbalance
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{ height: `${item.height}px` }}
          className="rounded-lg bg-dynamic-muted p-4"
        >
          <h4 className="font-bold">Item {item.id + 1}</h4>
          <p className="text-dynamic-muted-foreground text-sm">
            Height: {item.height}px
          </p>
        </div>
      ))}
    </Masonry>
  );
}
