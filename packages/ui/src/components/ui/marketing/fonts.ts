import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';

/**
 * Display face for marketing headlines.
 *
 * Be Vietnam Pro is drawn for Vietnamese typography, so `vi` headlines keep
 * their diacritics properly fitted instead of falling back mid-headline — and
 * it carries far more character than the body face at large sizes.
 */
export const marketingDisplayFont = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-be-vietnam-pro',
});

/**
 * Micro-label / numeric face: section eyebrows, indices, stat values. Also
 * covers Vietnamese so translated eyebrows stay in the same voice.
 */
export const marketingMonoFont = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

/**
 * Apply to the marketing layout's root element. `--font-display` and
 * `--font-mono-ui` in `globals.css` resolve through these variables and fall
 * back to the app font wherever the marketing faces are not loaded.
 */
export const marketingFontVariables = `${marketingDisplayFont.variable} ${marketingMonoFont.variable}`;
