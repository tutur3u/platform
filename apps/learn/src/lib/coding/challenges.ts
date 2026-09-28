import 'server-only';

export interface CodingChallenge {
  difficulty: 'easy' | 'medium';
  slug: string;
  starterCode: string;
  topic: 'arrays' | 'search' | 'stacks';
  samples: { input: string; output: string }[];
  cases: { input: string; expected: string; visible: boolean }[];
}

const challenges: CodingChallenge[] = [
  {
    slug: 'two-sum',
    difficulty: 'easy',
    topic: 'arrays',
    starterCode:
      'n = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Print two zero-based indices in ascending order.\n',
    samples: [{ input: '4\n2 7 11 15\n9\n', output: '0 1\n' }],
    cases: [
      { input: '4\n2 7 11 15\n9\n', expected: '0 1\n', visible: true },
      { input: '3\n3 2 4\n6\n', expected: '1 2\n', visible: false },
      { input: '2\n3 3\n6\n', expected: '0 1\n', visible: false },
      { input: '5\n-4 8 10 -1 3\n-5\n', expected: '0 3\n', visible: false },
    ],
  },
  {
    slug: 'binary-search',
    difficulty: 'easy',
    topic: 'search',
    starterCode:
      'n = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Print the index of target, or -1.\n',
    samples: [{ input: '5\n1 3 5 7 9\n7\n', output: '3\n' }],
    cases: [
      { input: '5\n1 3 5 7 9\n7\n', expected: '3\n', visible: true },
      { input: '5\n1 3 5 7 9\n2\n', expected: '-1\n', visible: false },
      { input: '1\n42\n42\n', expected: '0\n', visible: false },
      { input: '1\n42\n0\n', expected: '-1\n', visible: false },
    ],
  },
  {
    slug: 'balanced-brackets',
    difficulty: 'medium',
    topic: 'stacks',
    starterCode:
      'brackets = input().strip()\n\n# Print YES when brackets are balanced, otherwise NO.\n',
    samples: [{ input: '([]{})\n', output: 'YES\n' }],
    cases: [
      { input: '([]{})\n', expected: 'YES\n', visible: true },
      { input: '([)]\n', expected: 'NO\n', visible: false },
      { input: '((()))\n', expected: 'YES\n', visible: false },
      { input: '(()\n', expected: 'NO\n', visible: false },
      { input: '([{}])\n', expected: 'YES\n', visible: false },
    ],
  },
];

export function listCodingChallenges() {
  return challenges.map(({ cases: _cases, ...challenge }) => challenge);
}

export function getCodingChallenge(slug: string) {
  return challenges.find((challenge) => challenge.slug === slug) ?? null;
}
