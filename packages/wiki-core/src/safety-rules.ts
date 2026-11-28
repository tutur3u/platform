export const PUBLIC_SAFETY_RULES = [
  ['internal security register ID', /\bSR-\d{2,4}[a-z]?\b/],
  [
    'developer home-directory path',
    /(?<![\w\][)}./-])\/(?:Users|home)\/(?!runner\b|user\b)[A-Za-z][\w.-]*\//,
  ],
  ['tailnet hostname', /\.ts\.net\b/],
  [
    'tailnet address',
    /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/,
  ],
  [
    'Cloudflare account workers.dev host',
    /(?<![a-z0-9-])[a-z0-9][a-z0-9-]{0,62}\.[a-z0-9][a-z0-9-]{0,62}\.workers\.dev\b/i,
  ],
  [
    'private network address',
    /\b(?:192\.168|10\.(?!0\.2\.2\b)\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/,
  ],
  [
    'token-shaped secret',
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}|xox[bap]-[A-Za-z0-9-]{10,}|sbp_[a-z0-9]{30,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ],
  ['JWT-shaped token', /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.eyJ/],
  ['Supabase project host', /\b[a-z]{20}\.supabase\.(?:co|in)\b/i],
  ['agent or thread identifier', /\bmcp:(?:launch:|[0-9a-f]{8}-)/],
  ['personal email address', /(?<![\w.+-])[\w.+-]+@gmail\.com\b/i],
] as const;

export const TERM_SALT = 'e6b1b0ab4a648d7bdf07d985';
export const HASHED_TERMS = {
  'fleet host or machine name': [
    'ed8148614946d158db8d951c4d3e094968ca0044864953d3645ff65a2b8de71f',
    '4482cd9029faf3b7c9fdac756ccb4aebea4336a605755c58f7eee8adcda36e4d',
    'fb1909bbaa7a678371a5670b9a1d7325357b9a5e07b5d086d2542af60efca06a',
    '36be259a4716d726e1e7ec55a1e769091d3085d0bb187e4d1661b25602eefcc8',
    '0c8e297db2de8e9571c1be2d952504168a7f6646124e07b5be0ca469fee8b010',
  ],
  'Supabase project reference': [
    '58d7d0b620c81632f93139b32efbb1b79b71f6874cc6e3905874ce56952434e3',
    '4d266edcb9a14d9e34bc41fc29e41bdfeabba20ac0a62e8863d28b5968ec4bf2',
  ],
  'customer name without consent': [
    '5678f63af489867caaad8640b250669f1c8428bfaa238855f81c6c0b7dc85d38',
    '003bdad12e7c4bbc509ca5fca852d036bd978dc961a2baa54fea8f82cc3fc716',
    'fb30887a141b4c9f08ef197dc17507f2439ab52fd4f7f3062ecbb6a8590c3eae',
    'f4565f420aa43b8412b3c9b20eb5f6cff36a8459ca2d075418e42bdaf2dc35ac',
    '7636192057da9d1451170afdb02107b2a271c2ceb3e11213183f7172ec928f19',
    '3350e5525f44c24d21e490d6b302b2e9bb76d9e234611e953c013e9105f3c3ac',
  ],
  'personal or staff email address': [
    '517063b9955e61e83f0a04f7249eac2ef890db8a8e1bcac5387294bbab8001d8',
  ],
};
export const MAX_TERM_WORDS = 3;

export const PUBLIC_ONLY_SAFETY_RULES = [
  [
    'staging host',
    /\b(?:web|calendar|contacts|finance|meet|mail|apps)\.tutur3u\.com\b|(?<![a-z0-9-])[a-z0-9][a-z0-9-]{0,62}(?:\.staging\.tutur3u\.com|-staging\.tutur3u\.com)\b/i,
  ],
  [
    'staging worker name',
    /(?<![a-z0-9-])tuturuuu-[a-z0-9-]{0,62}staging[a-z0-9-]{0,62}(?![a-z0-9-])/i,
  ],
  [
    'bypass secret name',
    /\b[A-Z0-9_]*(?:AUTOMATION_BYPASS|BYPASS_SECRET|AUTH_BYPASS|PROTECTION_BYPASS)[A-Z0-9_]*\b/,
  ],
  [
    'workers.dev hostname',
    /(?<![a-z0-9-])[a-z0-9][a-z0-9-]{0,62}\.workers\.dev\b/i,
  ],
] as const;
