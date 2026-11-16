const articles = new Set(['van', 'von', 'der', 'den', 'de', 'la', 'les', 'le']);

export const getInitials = (name?: string | null): string => {
  if (!name) return '';

  // Replace tabs and newlines with spaces and trim
  const cleanName = name.replace(/[\t\n]/g, ' ').trim();
  if (!cleanName) return '';

  // Split by spaces, hyphens, and apostrophes
  const nameParts = cleanName.split(/[\s\-']+/).filter(Boolean);
  if (nameParts.length === 0) return '';

  // For single word names
  if (nameParts.length === 1) {
    return nameParts[0]!.charAt(0).toUpperCase();
  }

  const firstPart = nameParts[0]!.toLowerCase();

  // Special case: if the name starts with a capitalized prefix like "Van", use it
  if (nameParts[0]![0]?.toUpperCase() === nameParts[0]![0]) {
    return (
      nameParts[0]![0]! + nameParts[nameParts.length - 1]![0]
    ).toUpperCase();
  }

  // Otherwise look for the first non-prefix word and last word
  if (articles.has(firstPart)) {
    const lastPart = nameParts[nameParts.length - 1]!;
    return (nameParts[1] ? nameParts[1][0] : '') + lastPart[0]!.toUpperCase();
  }

  // Otherwise use first and last word
  return (
    (nameParts?.[0]?.[0] ?? '') + (nameParts?.[nameParts.length - 1]?.[0] ?? '')
  ).toUpperCase();
};

/**
 * Any user-shaped record that may carry name fields. Both snake_case (DB rows)
 * and camelCase (mapped DTOs) spellings are accepted so one helper serves
 * every surface.
 */
export interface UserNameSource {
  display_name?: string | null;
  displayName?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  email?: string | null;
  handle?: string | null;
  username?: string | null;
}

export interface ResolveUserDisplayNameOptions {
  /**
   * Show only the part of the email before "@" when the email is the chosen
   * value. Use it where space is tight (chips, cursors, avatar tooltips).
   */
  emailLocalPart?: boolean;
  /**
   * Returned only when the record has no usable name, email or handle at all.
   * Defaults to an empty string.
   */
  fallback?: string;
}

function cleanName(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * The single source of truth for "what do we call this user":
 * display name → full name → email → handle/username → `fallback`.
 *
 * Whitespace-only values count as unset. Accounts without a display name are
 * shown by their full name, then by their email, rather than by a generic
 * "Unknown" label.
 */
export function resolveUserDisplayName(
  user: UserNameSource | null | undefined,
  options: ResolveUserDisplayNameOptions = {}
): string {
  const fallback = options.fallback ?? '';
  if (!user) return fallback;

  const displayName = cleanName(user.display_name ?? user.displayName);
  if (displayName) return displayName;

  const fullName = cleanName(user.full_name ?? user.fullName);
  if (fullName) return fullName;

  const email = cleanName(user.email);
  if (email) return options.emailLocalPart ? emailLocalPart(email) : email;

  const handle = cleanName(user.handle ?? user.username);
  if (handle) return handle;

  return fallback;
}

/**
 * Like {@link resolveUserDisplayName}, but for a full-name slot: prefers the
 * full name and only then falls back to display name → email → handle.
 */
export function resolveUserFullName(
  user: UserNameSource | null | undefined,
  options: ResolveUserDisplayNameOptions = {}
): string {
  const fullName = cleanName(user?.full_name ?? user?.fullName);
  if (fullName) return fullName;
  return resolveUserDisplayName(user, options);
}

/**
 * Placeholders for the profile name inputs: each field hints with the other
 * name when it is set, and both fall back to the account email.
 */
export function resolveProfileNamePlaceholders(
  user: UserNameSource | null | undefined
): { displayName: string; fullName: string } {
  const displayName = cleanName(user?.display_name ?? user?.displayName);
  const fullName = cleanName(user?.full_name ?? user?.fullName);
  const email = cleanName(user?.email);

  return {
    displayName: fullName || email,
    fullName: displayName || email,
  };
}

export function getAvatarPlaceholder(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
}

/**
 * Generates a consistent fun name from a user ID
 */
export function generateFunName({
  id,
  locale = 'en',
}: {
  id: string;
  locale?: 'en' | 'vi' | string;
}): string {
  // List of adjectives and animals for fun names
  const adjectives = {
    en: [
      'Happy',
      'Silly',
      'Clever',
      'Brave',
      'Curious',
      'Playful',
      'Friendly',
      'Gentle',
      'Jolly',
      'Witty',
      'Mighty',
      'Dazzling',
      'Adventurous',
      'Bouncy',
      'Cheerful',
      'Daring',
      'Energetic',
      'Fuzzy',
      'Goofy',
      'Hilarious',
      'Intelligent',
      'Jumpy',
      'Kind',
      'Lively',
      'Magical',
      'Noble',
      'Optimistic',
      'Quirky',
      'Radiant',
      'Sassy',
      'Talented',
      'Unique',
      'Vibrant',
      'Whimsical',
      'Zealous',
      'Adorable',
    ],
    vi: [
      'Vui Vẻ', // Happy
      'Ngốc Nghếch', // Silly
      'Thông Minh', // Clever
      'Dũng Cảm', // Brave
      'Tò Mò', // Curious
      'Tinh Nghịch', // Playful
      'Thân Thiện', // Friendly
      'Dịu Dàng', // Gentle
      'Hạnh Phúc', // Jolly
      'Hóm Hỉnh', // Witty
      'Mạnh Mẽ', // Mighty
      'Lấp Lánh', // Dazzling
      'Phiêu Lưu', // Adventurous
      'Nhảy Nhót', // Bouncy
      'Vui Tươi', // Cheerful
      'Táo Bạo', // Daring
      'Năng Động', // Energetic
      'Xù Xì', // Fuzzy
      'Ngớ Ngẩn', // Goofy
      'Buồn Cười', // Hilarious
      'Thông Tuệ', // Intelligent
      'Nhảy Nhót', // Jumpy
      'Tốt Bụng', // Kind
      'Sống Động', // Lively
      'Kỳ Diệu', // Magical
      'Cao Quý', // Noble
      'Lạc Quan', // Optimistic
      'Kỳ Lạ', // Quirky
      'Rực Rỡ', // Radiant
      'Bướng Bỉnh', // Sassy
      'Tài Năng', // Talented
      'Độc Đáo', // Unique
      'Sôi Động', // Vibrant
      'Kỳ Quặc', // Whimsical
      'Nhiệt Tình', // Zealous
      'Đáng Yêu', // Adorable
    ],
  };

  const animals = {
    en: [
      { name: 'Octopus', emoji: '🐙' },
      { name: 'Cat', emoji: '🐱' },
      { name: 'Penguin', emoji: '🐧' },
      { name: 'Fox', emoji: '🦊' },
      { name: 'Panda', emoji: '🐼' },
      { name: 'Dolphin', emoji: '🐬' },
      { name: 'Koala', emoji: '🐨' },
      { name: 'Owl', emoji: '🦉' },
      { name: 'Tiger', emoji: '🐯' },
      { name: 'Rabbit', emoji: '🐰' },
      { name: 'Monkey', emoji: '🐵' },
      { name: 'Wolf', emoji: '🐺' },
      { name: 'Alligator', emoji: '🐊' },
      { name: 'Beaver', emoji: '🦫' },
      { name: 'Chameleon', emoji: '🦎' },
      { name: 'Duck', emoji: '🦆' },
      { name: 'Elephant', emoji: '🐘' },
      { name: 'Flamingo', emoji: '🦩' },
      { name: 'Giraffe', emoji: '🦒' },
      { name: 'Hedgehog', emoji: '🦔' },
      { name: 'Iguana', emoji: '🦎' },
      { name: 'Jellyfish', emoji: '🪼' },
      { name: 'Kangaroo', emoji: '🦘' },
      { name: 'Lion', emoji: '🦁' },
      { name: 'Meerkat', emoji: '🦝' },
      { name: 'Narwhal', emoji: '🦭' },
      { name: 'Otter', emoji: '🦦' },
      { name: 'Peacock', emoji: '🦚' },
      { name: 'Quokka', emoji: '🦘' },
      { name: 'Raccoon', emoji: '🦝' },
      { name: 'Sloth', emoji: '🦥' },
      { name: 'Turtle', emoji: '🐢' },
      { name: 'Unicorn', emoji: '🦄' },
      { name: 'Vulture', emoji: '🦅' },
      { name: 'Walrus', emoji: '🦭' },
      { name: 'Yak', emoji: '🐃' },
      { name: 'Zebra', emoji: '🦓' },
      { name: 'Badger', emoji: '🦡' },
      { name: 'Cheetah', emoji: '🐆' },
      { name: 'Dingo', emoji: '🐕' },
      { name: 'Ferret', emoji: '🦡' },
      { name: 'Gorilla', emoji: '🦍' },
    ],
    vi: [
      { name: 'Bạch Tuộc', emoji: '🐙' },
      { name: 'Mèo', emoji: '🐱' },
      { name: 'Chim Cánh Cụt', emoji: '🐧' },
      { name: 'Cáo', emoji: '🦊' },
      { name: 'Gấu Trúc', emoji: '🐼' },
      { name: 'Cá Heo', emoji: '🐬' },
      { name: 'Gấu Koala', emoji: '🐨' },
      { name: 'Cú Mèo', emoji: '🦉' },
      { name: 'Hổ', emoji: '🐯' },
      { name: 'Thỏ', emoji: '🐰' },
      { name: 'Khỉ', emoji: '🐵' },
      { name: 'Sói', emoji: '🐺' },
      { name: 'Cá Sấu', emoji: '🐊' },
      { name: 'Hải Ly', emoji: '🦫' },
      { name: 'Tắc Kè', emoji: '🦎' },
      { name: 'Vịt', emoji: '🦆' },
      { name: 'Voi', emoji: '🐘' },
      { name: 'Hồng Hạc', emoji: '🦩' },
      { name: 'Hươu Cao Cổ', emoji: '🦒' },
      { name: 'Nhím', emoji: '🦔' },
      { name: 'Kỳ Đà', emoji: '🦎' },
      { name: 'Sứa', emoji: '🪼' },
      { name: 'Kangaroo', emoji: '🦘' },
      { name: 'Sư Tử', emoji: '🦁' },
      { name: 'Cầy Meerkat', emoji: '🦝' },
      { name: 'Kỳ Lân Biển', emoji: '🦭' },
      { name: 'Rái Cá', emoji: '🦦' },
      { name: 'Công', emoji: '🦚' },
      { name: 'Quokka', emoji: '🦘' },
      { name: 'Gấu Mèo', emoji: '🦝' },
      { name: 'Lười', emoji: '🦥' },
      { name: 'Rùa', emoji: '🐢' },
      { name: 'Kỳ Lân', emoji: '🦄' },
      { name: 'Kền Kền', emoji: '🦅' },
      { name: 'Hải Mã', emoji: '🦭' },
      { name: 'Bò Yak', emoji: '🐃' },
      { name: 'Ngựa Vằn', emoji: '🦓' },
      { name: 'Lửng', emoji: '🦡' },
      { name: 'Báo', emoji: '🐆' },
      { name: 'Chó Dingo', emoji: '🐕' },
      { name: 'Chồn', emoji: '🦡' },
      { name: 'Khỉ Đột', emoji: '🦍' },
    ],
  };

  // Improved hash function for more randomness
  const hash = (str: string): number => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ char, 2654435761);
      h2 = Math.imul(h2 ^ char, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 = Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };

  // Use the appropriate language lists
  const selectedLocale = locale in adjectives ? locale : 'en';
  const adjectivesList =
    adjectives?.[selectedLocale as keyof typeof adjectives];
  const animalsList = animals?.[selectedLocale as keyof typeof animals];

  // Generate consistent indices
  const combinedHash = hash(id);
  const adjIndex = combinedHash % adjectivesList.length;
  const animalIndex = (combinedHash * 31) % animalsList.length;

  const adjective =
    adjectivesList[adjIndex] || (locale === 'en' ? 'Happy' : 'Vui');
  const animal = animalsList[animalIndex];

  if (!animal) {
    return locale === 'en'
      ? `${adjective} Mystery ❓`
      : `${adjective} Kỳ Bí ❓`;
  }

  return locale === 'vi'
    ? `${animal.name} ${adjective} ${animal.emoji}`
    : `${adjective} ${animal.name} ${animal.emoji}`;
}
