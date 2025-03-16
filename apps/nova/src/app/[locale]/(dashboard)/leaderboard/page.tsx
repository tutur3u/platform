import LeaderboardPage from './client';
import type { LeaderboardEntry } from '@/components/leaderboard/leaderboard';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * Generates a consistent fun name from a user ID
 */
function generateFunName(userId: string): string {
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

export default async function Page() {
  const sbAdmin = await createAdminClient();

  const { data: leaderboardData, error } = await sbAdmin.from('nova_sessions')
    .select(`
        user_id,
        total_score,
        users!inner(
          display_name,
          avatar_url
        )
      `);

  if (error) throw error;

  const groupedData = leaderboardData.reduce(
    (acc, curr) => {
      const existingUser = acc.find((item) => item.user_id === curr.user_id);
      if (existingUser) {
        existingUser.total_score =
          (existingUser.total_score ?? 0) + (curr.total_score ?? 0);
      } else {
        acc.push({
          user_id: curr.user_id,
          total_score: curr.total_score ?? 0,
          users: curr.users,
        });
      }
      return acc;
    },
    [] as typeof leaderboardData
  );

  groupedData.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));

  const formattedData: LeaderboardEntry[] = groupedData.map((entry, index) => ({
    id: entry.user_id,
    rank: index + 1,
    name: entry.users.display_name || generateFunName(entry.user_id),
    avatar: entry.users.avatar_url ?? '',
    score: entry.total_score ?? 0,
  }));

  return <LeaderboardPage data={formattedData} />;
}
