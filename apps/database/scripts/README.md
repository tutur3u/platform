# Database Scripts

This directory contains utility scripts for the database package.

## sort-types.js

A Node.js script that ensures consistent key ordering in the generated Supabase types file.

### Purpose

The Supabase type generator (`supabase gen types`) creates TypeScript interfaces with object keys that may be in different orders each time the command is run. This causes unnecessary git diffs and makes it difficult to track actual changes to the database schema.

### How it works

The script:

1. Reads the generated `packages/types/src/supabase.ts` file
2. Uses regex to find all object literals in the file
3. Identifies object literals that contain key-value pairs (with `:` characters)
4. Parses each object literal by splitting on semicolons while respecting nested structures
5. Sorts the keys alphabetically within each object literal
6. Preserves the TypeScript syntax and formatting
7. Writes the sorted content back to the file

### What gets sorted

The script sorts object keys in:

- `Row` objects (table row types)
- `Insert` objects (table insert types)
- `Update` objects (table update types)
- `Args` objects (function argument types)
- `Returns` objects (function return types)

### Usage

The script is automatically run as part of the `sb:typegen` command:

```bash
# From the root directory
bun sb:typegen

# From the db directory
cd apps/database && bun sb:typegen
```

### Cross-Platform Compatibility

The script works on all platforms (Windows, macOS, Linux) without additional setup:

- **Path handling**: Uses `path.join()` for cross-platform path construction
- **Error handling**: Provides comprehensive error messages with debugging information
- **Node.js compatibility**: Uses standard Node.js APIs available on all platforms

### Alternative Scripts

For users who prefer platform-specific scripts:

- **Windows**: `sort-types.bat` - Windows batch file
- **Unix/Linux/macOS**: `sort-types.sh` - Unix shell script
- **All platforms**: `sort-types.js` - Node.js script (recommended)

### Example

Before sorting:

```typescript
Args: {
  ws_id: string;
  user_id: string;
  limit?: number;
}
```

After sorting:

```typescript
Args: {
  limit?: number;
  user_id: string;
  ws_id: string;
}
```

### Integration

The script is integrated into the Supabase workflow:

1. **Generation**: `bun supabase gen types typescript --local --schema public`
2. **Sorting**: `node ./scripts/sort-types.js` (ensures consistent key ordering)
3. **Formatting**: `biome format --write` (applies consistent formatting)

This ensures that every time types are generated, the object keys are consistently ordered alphabetically, preventing unnecessary git diffs and making it easier to track actual database schema changes.
