import { SECURITY, UNSAFE } from './fields';

// Name alternatives below are fixture-specific canaries, not general name detection.
const ORG_UNSAFE =
  /(?:^|\s)(?:\/[\w.-]+|[a-z]:\\|\.\.?\/)|\b(?:feature|feat|fix|bugfix|hotfix|release|chore|docs|refactor|perf|claude)\/|\b(?:thread|run|session)[-_:][a-z0-9_-]+|\b(?:ignore (?:all |previous )?instructions|system prompt|you are (?:an? |the )|assistant:|<\/?(?:system|prompt)>|customer|khách hàng)\b|\b(?:Nguyễn Văn An|Trần Thị Bình|Lê Minh Châu)\b/iu;

// Rejected outright in every org text field: controls, format characters
// (zero-width, bidi, tags, soft hyphen), surrogates, private use, line and
// paragraph separators, and default-ignorable code points (CGJ, variation
// selectors, Hangul fillers). Nothing is stripped or collapsed on ingest.
const FORBIDDEN =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]|\p{Default_Ignorable_Code_Point}/u;
// Generic (Script=Inherited) combining marks that survive NFC have no
// precomposed form, so they can only decorate a letter (e.g. U+0336 strike).
const STRAY_MARK = /(?=\p{M})\p{Script=Inherited}/u;

export function orgTextAllowed(value: string) {
  return (
    !FORBIDDEN.test(value) &&
    !STRAY_MARK.test(value) &&
    value === value.normalize('NFC') &&
    value === value.normalize('NFKC')
  );
}

// Scripts a single identifier-like field may draw its letters from, each
// mapped to its UTS #39 augmented script set so Japanese, Korean and Chinese
// names that mix Han with kana, Hangul or Bopomofo still count as one script.
const SCRIPTS: Array<[string, readonly string[]]> = [
  ['Latin', ['Latn']],
  ['Greek', ['Grek']],
  ['Cyrillic', ['Cyrl']],
  ['Armenian', ['Armn']],
  ['Georgian', ['Geor']],
  ['Hebrew', ['Hebr']],
  ['Arabic', ['Arab']],
  ['Syriac', ['Syrc']],
  ['Thaana', ['Thaa']],
  ['Devanagari', ['Deva']],
  ['Bengali', ['Beng']],
  ['Gurmukhi', ['Guru']],
  ['Gujarati', ['Gujr']],
  ['Oriya', ['Orya']],
  ['Tamil', ['Taml']],
  ['Telugu', ['Telu']],
  ['Kannada', ['Knda']],
  ['Malayalam', ['Mlym']],
  ['Sinhala', ['Sinh']],
  ['Thai', ['Thai']],
  ['Lao', ['Laoo']],
  ['Tibetan', ['Tibt']],
  ['Myanmar', ['Mymr']],
  ['Khmer', ['Khmr']],
  ['Mongolian', ['Mong']],
  ['Ethiopic', ['Ethi']],
  ['Cherokee', ['Cher']],
  ['Canadian_Aboriginal', ['Cans']],
  ['Han', ['Hanb', 'Jpan', 'Kore']],
  ['Hiragana', ['Jpan']],
  ['Katakana', ['Jpan']],
  ['Bopomofo', ['Hanb']],
  ['Hangul', ['Kore']],
  ['Yi', ['Yiii']],
];
const SCRIPT_TESTS = SCRIPTS.map(
  ([name, sets]) => [new RegExp(`\\p{Script=${name}}`, 'u'), sets] as const
);
const NEUTRAL = /[\p{Script=Common}\p{Script=Inherited}]/u;

// True when every non-Common, non-Inherited character comes from one script
// (Latin mixed with Cyrillic or Greek look-alikes fails). Characters from a
// script outside the list fail closed.
export function singleScript(value: string) {
  let allowed: Set<string> | null = null;
  for (const char of value) {
    if (NEUTRAL.test(char)) continue;
    const sets = SCRIPT_TESTS.find(([pattern]) => pattern.test(char))?.[1];
    if (!sets) return false;
    allowed = new Set(allowed ? sets.filter((set) => allowed?.has(set)) : sets);
    if (allowed.size === 0) return false;
  }
  return true;
}

// Deny-scan only: high-confidence Cyrillic, Greek, Armenian and Latin
// look-alikes of ASCII letters. Not a full UTS #39 skeleton; identifier fields
// also enforce singleScript, and task titles are nulled when a fold matches.
const CONFUSABLES: Record<string, string> = {
  '\u{430}': 'a', // Cyrillic Small Letter A
  '\u{435}': 'e', // Cyrillic Small Letter Ie
  '\u{456}': 'i', // Cyrillic Small Letter Byelorussian-Ukrainian I
  '\u{458}': 'j', // Cyrillic Small Letter Je
  '\u{43A}': 'k', // Cyrillic Small Letter Ka
  '\u{43E}': 'o', // Cyrillic Small Letter O
  '\u{440}': 'p', // Cyrillic Small Letter Er
  '\u{441}': 'c', // Cyrillic Small Letter Es
  '\u{443}': 'y', // Cyrillic Small Letter U
  '\u{445}': 'x', // Cyrillic Small Letter Ha
  '\u{455}': 's', // Cyrillic Small Letter Dze
  '\u{4BB}': 'h', // Cyrillic Small Letter Shha
  '\u{501}': 'd', // Cyrillic Small Letter Komi De
  '\u{51B}': 'q', // Cyrillic Small Letter Qa
  '\u{51D}': 'w', // Cyrillic Small Letter We
  '\u{4CF}': 'l', // Cyrillic Small Letter Palochka
  '\u{4AF}': 'y', // Cyrillic Small Letter Straight U
  '\u{410}': 'A', // Cyrillic Capital Letter A
  '\u{412}': 'B', // Cyrillic Capital Letter Ve
  '\u{415}': 'E', // Cyrillic Capital Letter Ie
  '\u{41A}': 'K', // Cyrillic Capital Letter Ka
  '\u{41C}': 'M', // Cyrillic Capital Letter Em
  '\u{41D}': 'H', // Cyrillic Capital Letter En
  '\u{41E}': 'O', // Cyrillic Capital Letter O
  '\u{420}': 'P', // Cyrillic Capital Letter Er
  '\u{421}': 'C', // Cyrillic Capital Letter Es
  '\u{422}': 'T', // Cyrillic Capital Letter Te
  '\u{423}': 'Y', // Cyrillic Capital Letter U
  '\u{425}': 'X', // Cyrillic Capital Letter Ha
  '\u{405}': 'S', // Cyrillic Capital Letter Dze
  '\u{406}': 'I', // Cyrillic Capital Letter Byelorussian-Ukrainian I
  '\u{408}': 'J', // Cyrillic Capital Letter Je
  '\u{4C0}': 'I', // Cyrillic Letter Palochka
  '\u{51C}': 'W', // Cyrillic Capital Letter We
  '\u{3B1}': 'a', // Greek Small Letter Alpha
  '\u{3B9}': 'i', // Greek Small Letter Iota
  '\u{3BA}': 'k', // Greek Small Letter Kappa
  '\u{3BD}': 'v', // Greek Small Letter Nu
  '\u{3BF}': 'o', // Greek Small Letter Omicron
  '\u{3C1}': 'p', // Greek Small Letter Rho
  '\u{3C4}': 't', // Greek Small Letter Tau
  '\u{3C5}': 'u', // Greek Small Letter Upsilon
  '\u{3F2}': 'c', // Greek Lunate Sigma Symbol
  '\u{3F3}': 'j', // Greek Letter Yot
  '\u{391}': 'A', // Greek Capital Letter Alpha
  '\u{392}': 'B', // Greek Capital Letter Beta
  '\u{395}': 'E', // Greek Capital Letter Epsilon
  '\u{396}': 'Z', // Greek Capital Letter Zeta
  '\u{397}': 'H', // Greek Capital Letter Eta
  '\u{399}': 'I', // Greek Capital Letter Iota
  '\u{39A}': 'K', // Greek Capital Letter Kappa
  '\u{39C}': 'M', // Greek Capital Letter Mu
  '\u{39D}': 'N', // Greek Capital Letter Nu
  '\u{39F}': 'O', // Greek Capital Letter Omicron
  '\u{3A1}': 'P', // Greek Capital Letter Rho
  '\u{3A4}': 'T', // Greek Capital Letter Tau
  '\u{3A5}': 'Y', // Greek Capital Letter Upsilon
  '\u{3A7}': 'X', // Greek Capital Letter Chi
  '\u{3F9}': 'C', // Greek Capital Lunate Sigma Symbol
  '\u{585}': 'o', // Armenian Small Letter Oh
  '\u{57D}': 'u', // Armenian Small Letter Seh
  '\u{578}': 'n', // Armenian Small Letter Vo
  '\u{570}': 'h', // Armenian Small Letter Ho
  '\u{581}': 'g', // Armenian Small Letter Co
  '\u{131}': 'i', // Latin Small Letter Dotless I
  '\u{237}': 'j', // Latin Small Letter Dotless J
  '\u{251}': 'a', // Latin Small Letter Alpha
  '\u{261}': 'g', // Latin Small Letter Script G
  '\u{269}': 'i', // Latin Small Letter Iota
  '\u{28F}': 'y', // Latin Letter Small Capital Y
  '\u{1D05}': 'd', // Latin Letter Small Capital D
};
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'gu');
const fold = (value: string) =>
  value.replace(CONFUSABLE, (char) => CONFUSABLES[char] ?? char);

// The scan runs on normalized copies; stored values are never rewritten.
function denyForms(value: string) {
  const base = value
    .normalize('NFKC')
    .replace(/\p{Cf}|\p{Default_Ignorable_Code_Point}/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '');
  // Also scan with accents removed so `cústomer` cannot dodge ASCII terms.
  const bare = base.normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC');
  return [fold(base), fold(bare)];
}

export function orgTextDenied(value: string) {
  return denyForms(value).some(
    (form) => UNSAFE.test(form) || SECURITY.test(form) || ORG_UNSAFE.test(form)
  );
}
