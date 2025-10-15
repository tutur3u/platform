'use client';

import { textStyles } from './text-styles';
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { CheckIcon, CopyIcon, WandIcon } from '@ncthub/ui/icons';
import { Textarea } from '@ncthub/ui/textarea';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export function TextGeneratorClient() {
  const [inputText, setInputText] = useState('');
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [demoText, setDemoText] = useState('');
  const demoMessage = 'Hi, we are from RMIT Neo Culture Tech!';
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Typewriter effect for demo
  useEffect(() => {
    if (!isDemo) return;

    // Wait 2 seconds before starting typewriter effect
    const delayTimeout = setTimeout(() => {
      let currentIndex = 0;
      const typingInterval = setInterval(() => {
        if (currentIndex <= demoMessage.length) {
          setDemoText(demoMessage.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(typingInterval);
        }
      }, 200); // Type one character every 200ms

      // Store interval ID so we can clear it on cleanup
      return () => clearInterval(typingInterval);
    }, 2000); // 2 second delay before typing starts

    return () => clearTimeout(delayTimeout);
  }, [isDemo]);

  const handleFocus = () => {
    if (isDemo) {
      setIsDemo(false);
      setDemoText('');
      setInputText('');
    }
  };

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
    const textToTransform = isDemo ? demoText : inputText;
    if (!textToTransform.trim()) return {};

    const generated: Record<string, string> = {};

    Object.entries(textStyles).forEach(([key, style]) => {
      generated[key] = style.transform(textToTransform);
    });
    return generated;
  };

  const generatedTexts = generateAllStyles();

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WandIcon className="h-5 w-5 text-[#5FC6E5]" />
              Input Text
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              ref={textareaRef}
              placeholder="Enter your text here to transform into different styles..."
              value={isDemo ? demoText : inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={handleFocus}
              className="min-h-[100px] text-base"
              maxLength={500}
              readOnly={isDemo}
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Enter text to see it transformed into various Unicode styles
              </p>
              <Badge variant="secondary" className="text-xs">
                {(isDemo ? demoText : inputText).length}/500
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Generated Styles */}
      {((isDemo && demoText.trim()) || (!isDemo && inputText.trim())) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(textStyles).map(([key, style], index) => {
            const generatedText = generatedTexts[key];
            const isCopied = copiedStyle === key;

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.02 * index }}
                whileHover={{ y: -4 }}
              >
                <Card className="h-full transition-shadow hover:shadow-md">
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
                        disabled={isDemo}
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
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isDemo && !inputText.trim() && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="py-12 text-center">
                <WandIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-semibold">
                  Start Generating Text
                </h3>
                <p className="mx-auto max-w-md text-muted-foreground">
                  Enter some text above to see it transformed into various
                  Unicode styles. Perfect for creating eye-catching social media
                  posts and messages!
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
