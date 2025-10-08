'use client';

import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { CheckIcon, CopyIcon, WandIcon } from '@ncthub/ui/icons';
import { Textarea } from '@ncthub/ui/textarea';
import { useState } from 'react';

// Unicode character mappings for different text styles
const textStyles = {
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
          // A-Z -> 𝑨-𝒁
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

export function TextGeneratorClient() {
  const [inputText, setInputText] = useState('');
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);

  const handleCopy = async (text: string, styleName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStyle(styleName);

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedStyle(null);
      }, 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      console.error('Failed to copy text to clipboard');
    }
  };

  const generateAllStyles = (): Record<string, string> => {
    if (!inputText.trim()) return {};

    const generated: Record<string, string> = {};
    Object.entries(textStyles).forEach(([key, style]) => {
      generated[key] = style.transform(inputText);
    });
    return generated;
  };

  const generatedTexts = generateAllStyles();

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WandIcon className="h-5 w-5 text-[#5FC6E5]" />
            Input Text
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter your text here to transform into different styles..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[100px] text-base"
            maxLength={500}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Enter text to see it transformed into various Unicode styles
            </p>
            <Badge variant="secondary" className="text-xs">
              {inputText.length}/500
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Generated Styles */}
      {inputText.trim() && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(textStyles).map(([key, style]) => {
            const generatedText = generatedTexts[key];
            const isCopied = copiedStyle === key;

            return (
              <Card key={key} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <span>{style.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleCopy(generatedText || '', style.name)
                      }
                      className="h-8 w-8 p-0"
                    >
                      {isCopied ? (
                        <CheckIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <CopyIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {style.description}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex min-h-[60px] items-center rounded-lg border bg-muted/50 p-3">
                    <p
                      className="w-full text-base break-words"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {generatedText || 'Generated text will appear here...'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!inputText.trim() && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="py-12 text-center">
              <WandIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-semibold">
                Start Generating Text
              </h3>
              <p className="mx-auto max-w-md text-muted-foreground">
                Enter some text above to see it transformed into various Unicode
                styles. Perfect for creating eye-catching social media posts and
                messages!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Instructions */}
      <Card className="border-[#5FC6E5]/20 bg-[#5FC6E5]/5">
        <CardHeader>
          <CardTitle className="text-[#5FC6E5]">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold">✨ Generate Text</h4>
              <p className="text-sm text-muted-foreground">
                Type your text in the input field above and watch it transform
                into various Unicode styles instantly.
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">📋 Copy & Paste</h4>
              <p className="text-sm text-muted-foreground">
                Click the copy button next to any style to copy it to your
                clipboard, then paste it anywhere!
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">📱 Social Media</h4>
              <p className="text-sm text-muted-foreground">
                Perfect for Facebook, Twitter, Instagram, and other platforms
                that don't support text formatting.
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">🎨 Creative Posts</h4>
              <p className="text-sm text-muted-foreground">
                Make your posts stand out with bold, italic, script, and other
                unique text styles.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
