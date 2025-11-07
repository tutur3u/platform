# @tuturuuu/masonry

A lightweight, responsive masonry grid component for React with intelligent distribution strategies.

**Version**: 0.1.0 (Stable)

## Features

- 🎨 Pinterest-style masonry layout
- 📱 Responsive with customizable breakpoints
- ⚡ Lightweight with zero external dependencies
- 🎯 TypeScript support
- 🔧 Flexible configuration
- 🎭 Two distribution strategies: fast count-based or height-balanced
- 📊 Tested with 100+ items of varying sizes

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

### With Balanced Strategy (for varying heights)

```tsx
<Masonry
  columns={3}
  gap={16}
  strategy="balanced"
>
  {items.map((item) => (
    <div key={item.id} style={{ height: item.height }}>
      {item.content}
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
| `strategy` | `'count' \| 'balanced'` | `'count'` | Distribution strategy (see below) |

### Default Breakpoints

```typescript
{
  640: 1,   // >= 640px: 1 column
  768: 2,   // >= 768px: 2 columns
  1024: 3,  // >= 1024px: 3 columns
  1280: 4,  // >= 1280px: 4 columns
}
```

## Distribution Strategies

### Count Strategy (Default)

The `count` strategy distributes items based on item count, placing each item in the column with the fewest items. This is:
- ⚡ **Fast**: No measurement overhead
- 🎯 **Stable**: No layout shift after initial render
- ✅ **Best for**: Uniform content, cards, tiles

```tsx
<Masonry strategy="count" columns={3} gap={16}>
  {items.map(item => <Card key={item.id} {...item} />)}
</Masonry>
```

### Balanced Strategy

The `balanced` strategy measures actual item heights and distributes items to the shortest column. This provides:
- 🎨 **Better visual balance**: Columns have similar total heights
- 📏 **Accurate**: Uses actual measured heights
- 🔄 **Brief layout shift**: Items measured first, then redistributed
- ✅ **Best for**: Image galleries, content with varying heights

```tsx
<Masonry strategy="balanced" columns={3} gap={16}>
  {images.map(image => (
    <img key={image.id} src={image.url} alt={image.title} />
  ))}
</Masonry>
```

**Trade-offs**: The balanced strategy has a brief measurement phase (invisible to users) where items are measured before final distribution. This ensures optimal visual balance but may cause a single layout shift on initial load.

## How It Works

### Count Strategy Algorithm

1. Creates the specified number of columns
2. Iterates through all items
3. Places each item in the column with the fewest items
4. When columns have equal counts, rotates through them for even distribution

### Balanced Strategy Algorithm

1. **Measurement Phase**: Renders all items in a hidden single column to measure their heights
2. **Distribution Phase**: Distributes items to columns based on actual heights, always choosing the shortest column
3. **Result**: Columns have similar total heights for better visual balance

The component automatically adjusts the number of columns based on viewport width and configured breakpoints.

## Stability

**Status**: `@stable`

This component follows backwards-compatible changes only. Any breaking changes will be clearly documented with `BREAKING` notices.

## License

MIT
