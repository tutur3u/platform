# @tuturuuu/masonry

A lightweight, responsive masonry grid component for React with intelligent distribution strategies and robust progressive loading.

**Version**: 0.2.0 (Stable)

## Features

- 🎨 Pinterest-style masonry layout
- 📱 Responsive with customizable breakpoints
- ⚡ Lightweight with zero external dependencies
- 🎯 TypeScript support
- 🔧 Flexible configuration
- 🎭 Two distribution strategies: fast count-based or height-balanced
- 🖼️ Progressive loading with intelligent measurement
- 🚀 Immediate visibility - content appears instantly
- 🛡️ Robust error handling and validation
- 🔄 Smart redistribution - only updates when heights change
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
- 📏 **Accurate measurement**: Uses `getBoundingClientRect()` for precision
- 🔄 **Progressive loading**: Items visible immediately, redistributes as images load
- 🖼️ **Image-aware**: Continuously optimizes layout every 100ms during loading
- ✨ **Smart updates**: Only redistributes when heights actually change
- 🛡️ **Robust validation**: Validates measurements with intelligent fallbacks
- 🚫 **Auto-stops**: Measurements cease once all images are loaded
- ⚡ **Performance limit**: Maximum 50 measurement cycles (5 seconds) for safety
- ✅ **Best for**: Image galleries, content with varying heights

```tsx
<Masonry strategy="balanced" columns={3} gap={16}>
  {images.map(image => (
    <img key={image.id} src={image.url} alt={image.title} />
  ))}
</Masonry>
```

**How it works**: The balanced strategy shows items immediately using count-based distribution, then continuously measures and redistributes items every 100ms while images are loading. It uses a sophisticated greedy algorithm that:

- Validates all height measurements
- Uses average height for unmeasured items
- Only triggers updates when heights change by >1px
- Automatically stops when stable or after safety limit

**Performance**: Dual measurement approach (`getBoundingClientRect()` + `offsetHeight`) ensures accuracy. Change detection prevents unnecessary redistributions. Content is always visible, with background optimization happening via periodic updates that automatically clean up.

## How It Works

### Count Strategy Algorithm

1. Creates the specified number of columns
2. Iterates through all items
3. Places each item in the column with the fewest items
4. When columns have equal counts, rotates through them for even distribution

### Balanced Strategy Algorithm

1. **Immediate Render**: Items appear instantly using count-based distribution
2. **Accurate Measurement**: Uses `getBoundingClientRect()` + `offsetHeight` for precision
3. **Validation**: Validates all measurements; uses average for missing/invalid values
4. **Smart Updates**: Only redistributes when heights change by >1px
5. **Progressive Optimization**: Redistributes every 100ms while images load
6. **Image Load Tracking**: Monitors image loading with proper event listeners
7. **Auto-Cleanup**: Stops measuring once all images complete or after 50 attempts (5s)
8. **Final Balance**: Achieves optimal height distribution with greedy algorithm

The component automatically adjusts the number of columns based on viewport width and configured breakpoints.

## Recent Updates

### v0.2.0 (Current)

Major improvements to measurement and distribution:

- ✅ **Dual measurement system**: `getBoundingClientRect()` + `offsetHeight` for accuracy
- ✅ **Measurement validation**: Validates heights before use; intelligent fallbacks
- ✅ **Change detection**: Only updates when heights change >1px (avoids float precision issues)
- ✅ **Smart fallbacks**: Uses average of measured items for missing heights
- ✅ **Performance limits**: Max 50 measurement cycles (5 seconds) safety limit
- ✅ **Proper event listeners**: `addEventListener` with `{ once: true }` for images
- ✅ **Natural height validation**: Checks `img.naturalHeight > 0` for true load confirmation
- ✅ **Immediate updates on image load**: Triggers redistribution as each image completes
- ✅ **Greedy algorithm**: Improved distribution for better visual balance

### v0.1.7

- ✅ Fixed distribution algorithm to use strict `<` comparison
- ✅ Prevents items from piling up in later columns

### v0.1.6

- ✅ Added `data-item-index` tracking for accurate measurement mapping
- ✅ Fixed measurement correlation after redistribution

See [full changelog](https://github.com/tutur3u/platform/blob/main/packages/masonry/README.md#changelog) for more details.

## Stability

**Status**: `@stable`

This component follows backwards-compatible changes only. Any breaking changes will be clearly documented with `BREAKING` notices.

## License

MIT
