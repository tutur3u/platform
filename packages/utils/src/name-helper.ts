const articles = new Set(['van', 'von', 'der', 'den', 'de', 'la', 'les', 'le']);

export const getInitials = (name?: string | null): string => {
  if (!name) return '';

  // Replace tabs and newlines with spaces and trim
  const cleanName = name.replace(/[\t\n]/g, ' ').trim();
  if (!cleanName) return '';

  // Split by spaces, hyphens, and apostrophes
  let nameParts = cleanName.split(/[\s\-']+/).filter(Boolean);
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
 * Generates a consistent fun name from a user ID
 */
export function generateFunName(userId: string): string {
  // List of adjectives and animals for fun names
  const adjectives = [
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
  ];

  const animals = [
    'Octopus',
    'Cat',
    'Penguin',
    'Fox',
    'Panda',
    'Dolphin',
    'Koala',
    'Owl',
    'Tiger',
    'Rabbit',
    'Monkey',
    'Wolf',
    'Alligator',
    'Beaver',
    'Chameleon',
    'Duck',
    'Elephant',
    'Flamingo',
    'Giraffe',
    'Hedgehog',
    'Iguana',
    'Jellyfish',
    'Kangaroo',
    'Lion',
    'Meerkat',
    'Narwhal',
    'Otter',
    'Peacock',
    'Quokka',
    'Raccoon',
    'Sloth',
    'Turtle',
    'Unicorn',
    'Vulture',
    'Walrus',
    'Yak',
    'Zebra',
    'Badger',
    'Cheetah',
    'Dingo',
    'Ferret',
    'Gorilla',
  ];

  // Matching emojis for each animal
  const animalEmojis: Record<string, string> = {
    Octopus: '🐙',
    Cat: '🐱',
    Penguin: '🐧',
    Fox: '🦊',
    Panda: '🐼',
    Dolphin: '🐬',
    Koala: '🐨',
    Owl: '🦉',
    Tiger: '🐯',
    Rabbit: '🐰',
    Monkey: '🐵',
    Wolf: '🐺',
    Alligator: '🐊',
    Beaver: '🦫',
    Chameleon: '🦎',
    Duck: '🦆',
    Elephant: '🐘',
    Flamingo: '🦩',
    Giraffe: '🦒',
    Hedgehog: '🦔',
    Iguana: '🦎',
    Jellyfish: '🪼',
    Kangaroo: '🦘',
    Lion: '🦁',
    Meerkat: '🦝',
    Narwhal: '🦭',
    Otter: '🦦',
    Peacock: '🦚',
    Quokka: '🦘',
    Raccoon: '🦝',
    Sloth: '🦥',
    Turtle: '🐢',
    Unicorn: '🦄',
    Vulture: '🦅',
    Walrus: '🦭',
    Yak: '🐃',
    Zebra: '🦓',
    Badger: '🦡',
    Cheetah: '🐆',
    Dingo: '🐕',
    Ferret: '🦡',
    Gorilla: '🦍',
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

  // Generate consistent indices
  const combinedHash = hash(userId);
  const adjIndex = combinedHash % adjectives.length;
  const animalIndex = (combinedHash * 31) % animals.length;

  const animal = animals[animalIndex] || 'Mysterious';
  const emoji = animal in animalEmojis ? animalEmojis[animal] : '❓';

  return `${adjectives[adjIndex]} ${animal} ${emoji}`;
}
