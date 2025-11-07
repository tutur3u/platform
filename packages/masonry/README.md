# @tuturuuu/masonry

A lightweight, responsive masonry grid component for React.

## Features

- 🎨 Pinterest-style masonry layout
- 📱 Responsive with customizable breakpoints
- ⚡ Lightweight with zero external dependencies
- 🎯 TypeScript support
- 🔧 Flexible configuration

## Installation

```bash
bun add @tuturuuu/masonry
```

## Usage

### Basic Example

```tsx
import { Masonry } from '@tuturuuu/masonry';

export function Gallery() {
  return (
    <Masonry columns={3} gap={16}>
      <div>Item 1</div>
      <div>Item 2</div>
      <div>Item 3</div>
      <div>Item 4</div>
    </Masonry>
  );
}
```

### With Custom Breakpoints

```tsx
<Masonry
  columns={4}
  gap={20}
  breakpoints={{
    640: 1,   // 1 column on mobile
    768: 2,   // 2 columns on tablet
    1024: 3,  // 3 columns on desktop
    1280: 4,  // 4 columns on large desktop
  }}
>
  {items.map((item) => (
    <div key={item.id}>{item.content}</div>
  ))}
</Masonry>
```

### With Image Gallery

```tsx
<Masonry columns={3} gap={12} className="my-gallery">
  {images.map((image) => (
    <div key={image.id} className="rounded-lg overflow-hidden">
      <img
        src={image.url}
        alt={image.title}
        className="w-full h-auto"
      />
    </div>
  ))}
</Masonry>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode[]` | **required** | Array of items to display in the masonry grid |
| `columns` | `number` | `3` | Default number of columns |
| `gap` | `number` | `16` | Gap between items in pixels |
| `breakpoints` | `{ [key: number]: number }` | See below | Responsive breakpoint configuration |
| `className` | `string` | `''` | Additional CSS classes for the container |

### Default Breakpoints

```typescript
{
  640: 1,   // >= 640px: 1 column
  768: 2,   // >= 768px: 2 columns
  1024: 3,  // >= 1024px: 3 columns
  1280: 4,  // >= 1280px: 4 columns
}
```

## How It Works

The masonry component distributes items across columns in a round-robin fashion, ensuring balanced column heights. It automatically adjusts the number of columns based on the viewport width and configured breakpoints.

## Stability

**Status**: `@stable`

This component follows backwards-compatible changes only. Any breaking changes will be clearly documented with `BREAKING` notices.

## License

MIT
