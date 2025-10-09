// Unicode character mappings for different text styles
export const textStyles = {
  bold: {
    name: '𝐁𝐨𝐥𝐝',
    description: 'Bold text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z0-9]/g, (char) => {
        const code = char.charCodeAt(0);
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
      });
    },
  },
  italic: {
    name: '𝘐𝘵𝘢𝘭𝘪𝘤',
    description: 'Italic text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z]/g, (char) => {
        const code = char.charCodeAt(0);
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
      });
    },
  },
  boldItalic: {
    name: '𝙱𝚘𝚕𝚍 𝙸𝚝𝚊𝚕𝚒𝚌',
    description: 'Bold italic text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z]/g, (char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) {
          // A-Z -> 𝑱-𝒁
          return String.fromCodePoint(0x1d468 + code - 65);
        } else if (code >= 97 && code <= 122) {
          // a-z -> 𝒂-𝒛
          return String.fromCodePoint(0x1d482 + code - 97);
        }
        return char;
      });
    },
  },

  sansSerif: {
    name: '𝖲𝖺𝗇𝗌 𝖲𝖾𝗋𝗂𝖿',
    description: 'Sans-serif text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z0-9]/g, (char) => {
        const code = char.charCodeAt(0);
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
      });
    },
  },
  sansSerifBold: {
    name: '𝗕𝗼𝗹𝗱 𝗦𝗮𝗻𝘀',
    description: 'Bold sans-serif text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z0-9]/g, (char) => {
        const code = char.charCodeAt(0);
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
      });
    },
  },
  sansSerifItalic: {
    name: '𝘐𝘵𝘢𝘭𝘪𝘤 𝘚𝘢𝘯𝘴',
    description:
      'Italic sans-serif text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z]/g, (char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) {
          // A-Z -> 𝘈-𝘡
          return String.fromCodePoint(0x1d608 + code - 65);
        } else if (code >= 97 && code <= 122) {
          // a-z -> 𝘢-𝘻
          return String.fromCodePoint(0x1d622 + code - 97);
        }
        return char;
      });
    },
  },

  monospace: {
    name: '𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎',
    description: 'Monospace text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z0-9]/g, (char) => {
        const code = char.charCodeAt(0);
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
      });
    },
  },
  script: {
    name: '𝒮𝒸𝓇𝒾𝓅𝓉',
    description: 'Script/cursive text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z]/g, (char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) {
          // A-Z -> 𝒜-𝒵
          return String.fromCodePoint(0x1d49c + code - 65);
        } else if (code >= 97 && code <= 122) {
          switch (char) {
            case 'e':
              return String.fromCodePoint(0x212f); // Script e
            case 'g':
              return String.fromCodePoint(0x210a); // Script g
            case 'o':
              return String.fromCodePoint(0x2134); // Script o
          }
          // a-z -> 𝒶-𝓏
          return String.fromCodePoint(0x1d4b6 + code - 97);
        }
        return char;
      });
    },
  },
  scriptBold: {
    name: '𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽',
    description: 'Bold script text using Mathematical Alphanumeric Symbols',
    transform: (text: string) => {
      return text.replace(/[A-Za-z]/g, (char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) {
          // A-Z -> 𝓐-𝓩
          return String.fromCodePoint(0x1d4d0 + code - 65);
        } else if (code >= 97 && code <= 122) {
          // a-z -> 𝓪-𝔃
          return String.fromCodePoint(0x1d4ea + code - 97);
        }
        return char;
      });
    },
  },
};
