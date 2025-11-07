import { Masonry } from '@tuturuuu/masonry';
import type { ReactNode } from 'react';

// Example 1: Basic Usage
export function BasicExample() {
  return (
    <Masonry columns={3} gap={16}>
      <div className="rounded-lg bg-dynamic-blue p-4">Item 1</div>
      <div className="rounded-lg bg-dynamic-green p-4">Item 2</div>
      <div className="rounded-lg bg-dynamic-red p-4">Item 3</div>
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

// Example 4: Dynamic Content
export function DynamicMasonry() {
  const items = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    height: Math.floor(Math.random() * 200) + 100,
  }));

  return (
    <Masonry columns={4} gap={16}>
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
