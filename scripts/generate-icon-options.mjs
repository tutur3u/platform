/**
 * Generates icon-options.ts with all lucide icons, categories, and semantic keywords
 *
 * Run with: bun scripts/generate-icon-options.mjs
 *
 * This script:
 * 1. Fetches icon-category mappings from Lucide API
 * 2. Loads semantic tags from lucide-static
 * 3. Generates icon options with categories and keywords
 * 4. Generates CATEGORY_INFO with metadata
 */

import { writeFileSync } from 'node:fs';
import iconNodes from 'lucide-static/icon-nodes.json' with { type: 'json' };
import tags from 'lucide-static/tags.json' with { type: 'json' };

// Category metadata with representative icons
const CATEGORY_META = {
  accessibility: {
    icon: 'Accessibility',
    labelKey: 'icon-picker.categories.accessibility',
  },
  account: { icon: 'User', labelKey: 'icon-picker.categories.account' },
  animals: { icon: 'Bird', labelKey: 'icon-picker.categories.animals' },
  arrows: { icon: 'ArrowRight', labelKey: 'icon-picker.categories.arrows' },
  brands: { icon: 'Github', labelKey: 'icon-picker.categories.brands' },
  buildings: { icon: 'Building', labelKey: 'icon-picker.categories.buildings' },
  charts: { icon: 'BarChart3', labelKey: 'icon-picker.categories.charts' },
  communication: {
    icon: 'MessageCircle',
    labelKey: 'icon-picker.categories.communication',
  },
  connectivity: {
    icon: 'Wifi',
    labelKey: 'icon-picker.categories.connectivity',
  },
  cursors: { icon: 'MousePointer', labelKey: 'icon-picker.categories.cursors' },
  design: { icon: 'Palette', labelKey: 'icon-picker.categories.design' },
  development: { icon: 'Code', labelKey: 'icon-picker.categories.development' },
  devices: { icon: 'Smartphone', labelKey: 'icon-picker.categories.devices' },
  emoji: { icon: 'Smile', labelKey: 'icon-picker.categories.emoji' },
  files: { icon: 'File', labelKey: 'icon-picker.categories.files' },
  finance: { icon: 'DollarSign', labelKey: 'icon-picker.categories.finance' },
  'food-beverage': {
    icon: 'Coffee',
    labelKey: 'icon-picker.categories.food-beverage',
  },
  gaming: { icon: 'Gamepad2', labelKey: 'icon-picker.categories.gaming' },
  home: { icon: 'Home', labelKey: 'icon-picker.categories.home' },
  layout: { icon: 'LayoutGrid', labelKey: 'icon-picker.categories.layout' },
  mail: { icon: 'Mail', labelKey: 'icon-picker.categories.mail' },
  math: { icon: 'Calculator', labelKey: 'icon-picker.categories.math' },
  medical: { icon: 'Heart', labelKey: 'icon-picker.categories.medical' },
  multimedia: { icon: 'Play', labelKey: 'icon-picker.categories.multimedia' },
  nature: { icon: 'Leaf', labelKey: 'icon-picker.categories.nature' },
  navigation: { icon: 'Map', labelKey: 'icon-picker.categories.navigation' },
  notifications: {
    icon: 'Bell',
    labelKey: 'icon-picker.categories.notifications',
  },
  people: { icon: 'Users', labelKey: 'icon-picker.categories.people' },
  photography: {
    icon: 'Camera',
    labelKey: 'icon-picker.categories.photography',
  },
  science: { icon: 'FlaskConical', labelKey: 'icon-picker.categories.science' },
  seasons: { icon: 'Snowflake', labelKey: 'icon-picker.categories.seasons' },
  security: { icon: 'Shield', labelKey: 'icon-picker.categories.security' },
  shapes: { icon: 'Square', labelKey: 'icon-picker.categories.shapes' },
  shopping: {
    icon: 'ShoppingCart',
    labelKey: 'icon-picker.categories.shopping',
  },
  social: { icon: 'Users', labelKey: 'icon-picker.categories.social' },
  sports: { icon: 'Trophy', labelKey: 'icon-picker.categories.sports' },
  sustainability: {
    icon: 'Recycle',
    labelKey: 'icon-picker.categories.sustainability',
  },
  text: { icon: 'Type', labelKey: 'icon-picker.categories.text' },
  time: { icon: 'Clock', labelKey: 'icon-picker.categories.time' },
  tools: { icon: 'Wrench', labelKey: 'icon-picker.categories.tools' },
  transportation: {
    icon: 'Car',
    labelKey: 'icon-picker.categories.transportation',
  },
  travel: { icon: 'Plane', labelKey: 'icon-picker.categories.travel' },
  weather: { icon: 'Cloud', labelKey: 'icon-picker.categories.weather' },
};

// Fetch categories from Lucide API
async function fetchCategories() {
  try {
    const response = await fetch('https://lucide.dev/api/categories');
    if (!response.ok) {
      console.warn('Failed to fetch categories from API, using fallback');
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('Error fetching categories:', error.message);
    return null;
  }
}

function toPascalCase(str) {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Generate keywords based on icon name and tags
function generateKeywords(kebabName) {
  const words = kebabName.split('-');
  const keywords = new Set(words);

  // Add tags from lucide-static
  const iconTags = tags[kebabName];
  if (iconTags && Array.isArray(iconTags)) {
    for (const tag of iconTags) {
      keywords.add(tag.toLowerCase());
    }
  }

  // Add common related terms
  const keywordMappings = {
    arrow: ['direction', 'navigate', 'pointer'],
    user: ['person', 'profile', 'account', 'member'],
    users: ['team', 'group', 'people', 'members'],
    file: ['document', 'paper', 'page'],
    folder: ['directory', 'files', 'organize'],
    mail: ['email', 'message', 'inbox', 'letter'],
    message: ['chat', 'comment', 'conversation'],
    calendar: ['date', 'schedule', 'event', 'planner'],
    clock: ['time', 'schedule', 'hours'],
    bell: ['notification', 'alert', 'reminder'],
    star: ['favorite', 'bookmark', 'rating'],
    heart: ['love', 'like', 'favorite'],
    home: ['house', 'main', 'dashboard'],
    settings: ['gear', 'config', 'preferences', 'options'],
    search: ['find', 'lookup', 'magnify', 'query'],
    play: ['start', 'video', 'audio', 'media'],
    pause: ['stop', 'wait', 'hold'],
    download: ['save', 'get', 'export'],
    upload: ['send', 'share', 'import'],
    trash: ['delete', 'remove', 'bin', 'garbage'],
    lock: ['secure', 'private', 'password', 'protected'],
    unlock: ['open', 'access', 'public'],
    key: ['password', 'access', 'secret'],
    shield: ['security', 'protection', 'safe'],
    check: ['done', 'complete', 'verified', 'success'],
    plus: ['add', 'new', 'create'],
    minus: ['remove', 'subtract', 'less'],
    eye: ['view', 'visible', 'show', 'watch'],
    code: ['programming', 'development', 'script'],
    terminal: ['command', 'cli', 'console', 'shell'],
    git: ['version', 'repository', 'code'],
    dollar: ['money', 'currency', 'price', 'payment'],
    credit: ['payment', 'card', 'bank'],
    wallet: ['money', 'payment', 'funds'],
    chart: ['analytics', 'statistics', 'graph', 'data'],
    sun: ['sunny', 'bright', 'day', 'light'],
    moon: ['night', 'dark', 'sleep'],
    cloud: ['weather', 'storage', 'sky'],
    camera: ['photo', 'picture', 'capture'],
    image: ['photo', 'picture', 'gallery'],
    video: ['movie', 'camera', 'record'],
    music: ['audio', 'song', 'sound'],
    phone: ['call', 'telephone', 'mobile'],
    wifi: ['internet', 'wireless', 'network'],
    bluetooth: ['wireless', 'connect', 'pair'],
    cpu: ['processor', 'chip', 'computer'],
    database: ['data', 'storage', 'sql', 'backend'],
    server: ['hosting', 'backend', 'cloud'],
    globe: ['world', 'earth', 'international', 'web'],
    map: ['location', 'geography', 'directions'],
    pin: ['location', 'marker', 'bookmark'],
    compass: ['direction', 'navigation', 'explore'],
    car: ['vehicle', 'drive', 'auto', 'transport'],
    plane: ['flight', 'travel', 'airplane'],
    train: ['railway', 'travel', 'commute'],
    truck: ['delivery', 'shipping', 'cargo'],
    ship: ['boat', 'cruise', 'sea'],
    bike: ['cycling', 'bicycle', 'exercise'],
    book: ['read', 'study', 'education', 'library'],
    graduation: ['education', 'school', 'university', 'degree'],
    school: ['education', 'building', 'learning'],
    brain: ['mind', 'thinking', 'intelligence'],
    rocket: ['launch', 'startup', 'growth', 'fast'],
    target: ['goal', 'aim', 'objective', 'focus'],
    trophy: ['winner', 'award', 'achievement', 'prize'],
    award: ['achievement', 'badge', 'recognition'],
    medal: ['winner', 'achievement', 'first'],
    gift: ['present', 'reward', 'surprise'],
    tag: ['label', 'category', 'price'],
    bug: ['error', 'issue', 'debug', 'problem'],
    wrench: ['tool', 'fix', 'repair', 'settings'],
    hammer: ['tool', 'build', 'construct'],
    scissors: ['cut', 'trim', 'edit'],
    paint: ['art', 'design', 'color'],
    palette: ['colors', 'art', 'design', 'theme'],
    brush: ['paint', 'art', 'design'],
    lightbulb: ['idea', 'tip', 'hint', 'innovation'],
    zap: ['lightning', 'flash', 'energy', 'power', 'fast'],
    flame: ['fire', 'hot', 'trending', 'popular'],
    coffee: ['drink', 'cafe', 'morning', 'cup'],
    pizza: ['food', 'italian', 'fastfood'],
    cake: ['birthday', 'dessert', 'celebration'],
    apple: ['fruit', 'healthy', 'food'],
    beer: ['drink', 'alcohol', 'bar'],
    wine: ['drink', 'alcohol', 'celebration'],
    gamepad: ['gaming', 'controller', 'play'],
    dice: ['game', 'random', 'luck'],
    party: ['celebration', 'event', 'fun'],
    sparkle: ['magic', 'new', 'special', 'shine'],
    crown: ['king', 'queen', 'premium', 'vip', 'admin'],
    diamond: ['gem', 'premium', 'jewel'],
    gem: ['diamond', 'jewel', 'precious'],
    battery: ['power', 'charge', 'energy'],
    power: ['on', 'off', 'switch', 'energy'],
    plug: ['connect', 'electric', 'charge'],
    refresh: ['reload', 'sync', 'update'],
    rotate: ['turn', 'spin', 'orientation'],
    alert: ['warning', 'error', 'danger', 'important'],
    info: ['information', 'help', 'about'],
    help: ['question', 'support', 'faq'],
    circle: ['shape', 'round', 'dot'],
    square: ['shape', 'box', 'rectangle'],
    triangle: ['shape', 'warning', 'play'],
    hexagon: ['shape', 'polygon', 'honeycomb'],
    layout: ['design', 'grid', 'template'],
    layers: ['stack', 'design', 'overlap'],
    blocks: ['components', 'modules', 'build'],
    bot: ['robot', 'ai', 'automation', 'assistant'],
    fingerprint: ['biometric', 'identity', 'security'],
    scan: ['scanner', 'qr', 'read'],
    qr: ['code', 'scan', 'barcode'],
    bar: ['code', 'scan', 'product'],
    magnet: ['attract', 'pull', 'attach'],
  };

  // Add mapped keywords
  for (const word of words) {
    if (keywordMappings[word]) {
      for (const kw of keywordMappings[word]) {
        keywords.add(kw);
      }
    }
  }

  return Array.from(keywords)
    .filter((kw) => kw.length > 2)
    .slice(0, 8);
}

// Generate human-readable label from PascalCase
function generateLabel(pascalName) {
  return pascalName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
    .replace(/(\d)/g, ' $1');
}

async function main() {
  console.log('Fetching categories from Lucide API...');
  const categoriesData = await fetchCategories();

  // Build category-to-icons mapping
  const categoryIconCounts = {};
  const iconCategories = {};

  if (categoriesData) {
    for (const [kebabName, cats] of Object.entries(categoriesData)) {
      iconCategories[kebabName] = cats;
      for (const cat of cats) {
        categoryIconCounts[cat] = (categoryIconCounts[cat] || 0) + 1;
      }
    }
    console.log(
      `Loaded ${Object.keys(iconCategories).length} icon-category mappings`
    );
  } else {
    console.log('Using empty categories (API unavailable)');
  }

  const allIcons = Object.keys(iconNodes)
    .map((kebabName) => ({
      kebab: kebabName,
      pascal: toPascalCase(kebabName),
      label: generateLabel(toPascalCase(kebabName)),
      keywords: generateKeywords(kebabName),
      categories: iconCategories[kebabName] || [],
    }))
    .sort((a, b) => a.pascal.localeCompare(b.pascal));

  // Build the TypeScript file
  let output = `/**
 * Icon options with semantic keywords and categories for improved search
 *
 * This module provides all ${allIcons.length} lucide icons with semantic keywords
 * and category information for improved search and browsing.
 *
 * NOTE: This file is auto-generated. To regenerate, run:
 * bun scripts/generate-icon-options.mjs
 */

import type { LucideIcon } from '@tuturuuu/icons';
import * as icons from '@tuturuuu/icons';
import type { Database as SupabaseDatabase } from '@tuturuuu/types';

import type { CategoryInfo, IconCategory, IconOption } from './types';

type DbPlatformIcon =
  SupabaseDatabase['public']['Enums']['platform_icon'];

/**
 * All available lucide icon names (PascalCase)
 *
 * This list contains all ${allIcons.length} icons from lucide-react.
 * The database enum (DbPlatformIcon) contains exactly these values.
 */
export const PLATFORM_ICON_VALUES = [
`;

  // Output icon values array
  allIcons.forEach((icon, i) => {
    const comma = i < allIcons.length - 1 ? ',' : ',';
    output += `  '${icon.pascal}'${comma}\n`;
  });

  output += `] as const satisfies readonly DbPlatformIcon[];

/**
 * Type for valid platform icon keys
 * This is the full set of lucide icons available in the picker
 */
export type PlatformIconKey = (typeof PLATFORM_ICON_VALUES)[number];

// Compile-time assertion: ensure UI list covers the DB enum.
// This will error if the database has icons not in our list.
type _IconValuesCoverDb =
  Exclude<DbPlatformIcon, PlatformIconKey> extends never
    ? true
    : { error: 'Database enum has values not in PLATFORM_ICON_VALUES' };
export type AssertPlatformIconValuesCoverDb = _IconValuesCoverDb;

/**
 * Category metadata for the icon picker UI
 *
 * Sorted by icon count (descending) for better UX.
 * Total icons across all categories: ${Object.values(categoryIconCounts).reduce((a, b) => a + b, 0)}
 * (Note: icons can belong to multiple categories)
 */
export const CATEGORY_INFO: CategoryInfo[] = [
`;

  // Sort categories by count descending
  const sortedCategories = Object.entries(CATEGORY_META)
    .map(([id, meta]) => ({
      id,
      ...meta,
      count: categoryIconCounts[id] || 0,
    }))
    .sort((a, b) => b.count - a.count);

  sortedCategories.forEach((cat, i) => {
    const comma = i < sortedCategories.length - 1 ? ',' : ',';
    output += `  {\n`;
    output += `    id: '${cat.id}' as IconCategory,\n`;
    output += `    labelKey: '${cat.labelKey}',\n`;
    output += `    count: ${cat.count},\n`;
    output += `    icon: '${cat.icon}',\n`;
    output += `  }${comma}\n`;
  });

  output += `];

/**
 * Complete icon options with semantic keywords and categories
 *
 * Keywords enable users to find icons by concept rather than just name.
 * For example, searching "money" will find DollarSign, Banknote, Wallet, etc.
 *
 * Categories enable browsing by type (e.g., "finance", "development").
 * Icons can belong to multiple categories.
 */
export const ICON_OPTIONS: IconOption[] = [
`;

  // Output icon options array
  allIcons.forEach((icon, i) => {
    const comma = i < allIcons.length - 1 ? ',' : ',';

    output += `  {\n`;
    output += `    value: '${icon.pascal}',\n`;
    output += `    label: '${icon.label}',\n`;
    output += `    Icon: icons.${icon.pascal} as LucideIcon,\n`;
    if (icon.keywords.length > 0) {
      // Format keywords - inline if short enough, otherwise multiline
      const keywordsStr = icon.keywords.map((k) => `'${k}'`).join(', ');
      if (keywordsStr.length <= 60) {
        output += `    keywords: [${keywordsStr}],\n`;
      } else {
        output += `    keywords: [\n`;
        for (let ki = 0; ki < icon.keywords.length; ki++) {
          const kComma = ',';
          output += `      '${icon.keywords[ki]}'${kComma}\n`;
        }
        output += `    ],\n`;
      }
    }
    if (icon.categories.length > 0) {
      // Categories are always inline since they're short
      const categoriesStr = icon.categories.map((c) => `'${c}'`).join(', ');
      output += `    categories: [${categoriesStr}] as IconCategory[],\n`;
    }
    output += `  }${comma}\n`;
  });

  output += `];

/**
 * Get icon component by key
 *
 * Accepts either a database enum value or any valid icon key string.
 * Returns undefined if the icon is not found.
 */
export function getIconComponentByKey(
  value:
    | DbPlatformIcon
    | PlatformIconKey
    | string
    | null
    | undefined
): LucideIcon | undefined {
  if (!value) return undefined;
  return ICON_OPTIONS.find((o) => o.value === value)?.Icon;
}

/**
 * Get icons filtered by category
 *
 * Returns all icons that belong to the specified category.
 * If category is 'all' or undefined, returns all icons.
 */
export function getIconsByCategory(
  category: IconCategory | 'all' | undefined
): IconOption[] {
  if (!category || category === 'all') return ICON_OPTIONS;
  return ICON_OPTIONS.filter((icon) => icon.categories?.includes(category));
}

/**
 * Get category icon component by category ID
 */
export function getCategoryIcon(
  categoryId: IconCategory
): LucideIcon | undefined {
  const categoryInfo = CATEGORY_INFO.find((c) => c.id === categoryId);
  if (!categoryInfo) return undefined;
  return getIconComponentByKey(categoryInfo.icon);
}
`;

  const outputPath =
    'packages/ui/src/components/ui/custom/icon-picker/icon-options.ts';
  writeFileSync(outputPath, output);
  console.log(
    `Generated ${outputPath} with ${allIcons.length} icons and ${sortedCategories.length} categories`
  );

  // Print category stats
  console.log('\nCategory counts:');
  sortedCategories.slice(0, 10).forEach((cat) => {
    console.log(`  ${cat.id}: ${cat.count} icons`);
  });
  console.log(`  ... and ${sortedCategories.length - 10} more categories`);
}

main().catch(console.error);
