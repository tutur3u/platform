// Vietnamese character mapping for base letters
const vietnameseBaseMap: Record<string, string> = {
  à: 'a',
  á: 'a',
  ả: 'a',
  ã: 'a',
  ạ: 'a',
  ă: 'a',
  ằ: 'a',
  ắ: 'a',
  ẳ: 'a',
  ẵ: 'a',
  ặ: 'a',
  â: 'a',
  ầ: 'a',
  ấ: 'a',
  ẩ: 'a',
  ẫ: 'a',
  ậ: 'a',
  è: 'e',
  é: 'e',
  ẻ: 'e',
  ẽ: 'e',
  ẹ: 'e',
  ê: 'e',
  ề: 'e',
  ế: 'e',
  ể: 'e',
  ễ: 'e',
  ệ: 'e',
  ì: 'i',
  í: 'i',
  ỉ: 'i',
  ĩ: 'i',
  ị: 'i',
  ò: 'o',
  ó: 'o',
  ỏ: 'o',
  õ: 'o',
  ọ: 'o',
  ô: 'o',
  ồ: 'o',
  ố: 'o',
  ổ: 'o',
  ỗ: 'o',
  ộ: 'o',
  ơ: 'o',
  ờ: 'o',
  ớ: 'o',
  ở: 'o',
  ỡ: 'o',
  ợ: 'o',
  ù: 'u',
  ú: 'u',
  ủ: 'u',
  ũ: 'u',
  ụ: 'u',
  ư: 'u',
  ừ: 'u',
  ứ: 'u',
  ử: 'u',
  ữ: 'u',
  ự: 'u',
  ỳ: 'y',
  ý: 'y',
  ỷ: 'y',
  ỹ: 'y',
  ỵ: 'y',
};

// Get diacritical marks from Vietnamese character (both tone marks and vowel modifications)
const getVietnameseDiacritics = (char: string): string => {
  const diacriticsMap: Record<string, string> = {
    // Regular vowels with tones
    à: '\u0300',
    á: '\u0301',
    ả: '\u0309',
    ã: '\u0303',
    ạ: '\u0323',
    // ă (breve) with tones
    ă: '\u0306',
    ằ: '\u0306\u0300',
    ắ: '\u0306\u0301',
    ẳ: '\u0306\u0309',
    ẵ: '\u0306\u0303',
    ặ: '\u0306\u0323',
    // â (circumflex) with tones
    â: '\u0302',
    ầ: '\u0302\u0300',
    ấ: '\u0302\u0301',
    ẩ: '\u0302\u0309',
    ẫ: '\u0302\u0303',
    ậ: '\u0302\u0323',
    // e with tones
    è: '\u0300',
    é: '\u0301',
    ẻ: '\u0309',
    ẽ: '\u0303',
    ẹ: '\u0323',
    // ê (circumflex) with tones
    ê: '\u0302',
    ề: '\u0302\u0300',
    ế: '\u0302\u0301',
    ể: '\u0302\u0309',
    ễ: '\u0302\u0303',
    ệ: '\u0302\u0323',
    // i with tones
    ì: '\u0300',
    í: '\u0301',
    ỉ: '\u0309',
    ĩ: '\u0303',
    ị: '\u0323',
    // o with tones
    ò: '\u0300',
    ó: '\u0301',
    ỏ: '\u0309',
    õ: '\u0303',
    ọ: '\u0323',
    // ô (circumflex) with tones
    ô: '\u0302',
    ồ: '\u0302\u0300',
    ố: '\u0302\u0301',
    ổ: '\u0302\u0309',
    ỗ: '\u0302\u0303',
    ộ: '\u0302\u0323',
    // ơ (horn) with tones
    ơ: '\u031B',
    ờ: '\u031B\u0300',
    ớ: '\u031B\u0301',
    ở: '\u031B\u0309',
    ỡ: '\u031B\u0303',
    ợ: '\u031B\u0323',
    // u with tones
    ù: '\u0300',
    ú: '\u0301',
    ủ: '\u0309',
    ũ: '\u0303',
    ụ: '\u0323',
    // ư (horn) with tones
    ư: '\u031B',
    ừ: '\u031B\u0300',
    ứ: '\u031B\u0301',
    ử: '\u031B\u0309',
    ữ: '\u031B\u0303',
    ự: '\u031B\u0323',
    // y with tones
    ỳ: '\u0300',
    ý: '\u0301',
    ỷ: '\u0309',
    ỹ: '\u0303',
    ỵ: '\u0323',
  };
  return diacriticsMap[char] || '';
};

export const textStyles = {
  bold: {
    name: '𝐁𝐨𝐥𝐝',
    description:
      'Makes your text stand out. Perfect for headlines and emphasis.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d41a + baseCode - 97
            );
            const diacritics = getVietnameseDiacritics(lowerChar);
            return transformedBase + diacritics;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝐀-𝐙
            return String.fromCodePoint(0x1d400 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝐚-𝐳
            return String.fromCodePoint(0x1d41a + code - 97);
          } else if (code >= 48 && code <= 57) {
            // 0-9 -> 𝟎-𝟗
            return String.fromCodePoint(0x1d7ce + code - 48);
          }
          return char;
        }
      );
    },
  },
  italic: {
    name: '𝘐𝘵𝘢𝘭𝘪𝘤',
    description: 'Adds a touch of elegance or emphasis with a slanted style.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            let transformedBase: string;

            if (baseChar === 'h') {
              transformedBase = 'ℎ';
            } else {
              const baseCode = baseChar.charCodeAt(0);
              transformedBase = String.fromCodePoint(0x1d44e + baseCode - 97);
            }

            const diacritics = getVietnameseDiacritics(lowerChar);
            return transformedBase + diacritics;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝐴-𝑍
            return String.fromCodePoint(0x1d434 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝑎-𝑧
            // Because 'h' at U+210E is reserved for Planck constant, then we use the italic h from Mathematical Alphanumeric Symbols
            if (char === 'h') {
              return 'ℎ';
            }
            return String.fromCodePoint(0x1d44e + code - 97);
          }
          return char;
        }
      );
    },
  },
  boldItalic: {
    name: '𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄',
    description:
      'For maximum impact. Combines the strength of bold with the flair of italic.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d482 + baseCode - 97
            );
            const tone = getVietnameseDiacritics(lowerChar);
            return transformedBase + tone;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝑱-𝒁
            return String.fromCodePoint(0x1d468 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝒂-𝒛
            return String.fromCodePoint(0x1d482 + code - 97);
          }
          return char;
        }
      );
    },
  },

  sansSerif: {
    name: '𝖲𝖺𝗇𝗌 𝖲𝖾𝗋𝗂𝖿',
    description:
      'A clean, modern, and highly readable style for a minimalist look.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d5ba + baseCode - 97
            );
            const tone = getVietnameseDiacritics(lowerChar);
            return transformedBase + tone;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝖠-𝖹
            return String.fromCodePoint(0x1d5a0 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝖺-𝗓
            return String.fromCodePoint(0x1d5ba + code - 97);
          } else if (code >= 48 && code <= 57) {
            // 0-9 -> 𝟢-𝟫
            return String.fromCodePoint(0x1d7e2 + code - 48);
          }
          return char;
        }
      );
    },
  },

  sansSerifBold: {
    name: '𝗕𝗼𝗹𝗱 𝗦𝗮𝗻𝘀',
    description: 'Strong and modern. Great for clear, impactful statements.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d5ee + baseCode - 97
            );
            const tone = getVietnameseDiacritics(lowerChar);
            return transformedBase + tone;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝗔-𝗭
            return String.fromCodePoint(0x1d5d4 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝗮-𝘇
            return String.fromCodePoint(0x1d5ee + code - 97);
          } else if (code >= 48 && code <= 57) {
            // 0-9 -> 𝟬-𝟵
            return String.fromCodePoint(0x1d7ec + code - 48);
          }
          return char;
        }
      );
    },
  },
  sansSerifItalic: {
    name: '𝘐𝘵𝘢𝘭𝘪𝘤 𝘚𝘢𝘯𝘴',
    description: 'A sleek and stylish slant on the modern sans-serif font.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d622 + baseCode - 97
            );
            const tone = getVietnameseDiacritics(lowerChar);
            return transformedBase + tone;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝘈-𝘡
            return String.fromCodePoint(0x1d608 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝘢-𝘻
            return String.fromCodePoint(0x1d622 + code - 97);
          }
          return char;
        }
      );
    },
  },

  monospace: {
    name: '𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎',
    description:
      'Gives a classic typewriter or computer code feel to your text.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d68a + baseCode - 97
            );
            const tone = getVietnameseDiacritics(lowerChar);
            return transformedBase + tone;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝙰-𝚉
            return String.fromCodePoint(0x1d670 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝚊-𝚣
            return String.fromCodePoint(0x1d68a + code - 97);
          } else if (code >= 48 && code <= 57) {
            // 0-9 -> 𝟶-𝟿
            return String.fromCodePoint(0x1d7f6 + code - 48);
          }
          return char;
        }
      );
    },
  },

  scriptBold: {
    name: '𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽',
    description:
      'An elegant, handwritten cursive style for a formal or personal touch.',
    transform: (text: string) => {
      return text.replace(
        /[A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/g,
        (char) => {
          const lowerChar = char.toLowerCase();
          const code = char.charCodeAt(0);

          // Handle Vietnamese characters
          if (vietnameseBaseMap[lowerChar]) {
            const baseChar = vietnameseBaseMap[lowerChar];
            const baseCode = baseChar.charCodeAt(0);
            const transformedBase = String.fromCodePoint(
              0x1d4ea + baseCode - 97
            );
            const tone = getVietnameseDiacritics(lowerChar);
            return transformedBase + tone;
          }

          if (code >= 65 && code <= 90) {
            // A-Z -> 𝓐-𝓩
            return String.fromCodePoint(0x1d4d0 + code - 65);
          } else if (code >= 97 && code <= 122) {
            // a-z -> 𝓪-𝔃
            return String.fromCodePoint(0x1d4ea + code - 97);
          }
          return char;
        }
      );
    },
  },
};
