'use client';

import { Button } from '@ncthub/ui/button';
import { Card, CardContent } from '@ncthub/ui/card';
import { Copy } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface ColorCardProps {
  hex: string;
  delay?: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1] ?? '0', 16),
        g: Number.parseInt(result[2] ?? '0', 16),
        b: Number.parseInt(result[3] ?? '0', 16),
      }
    : { r: 0, g: 0, b: 0 };
}

export default function ColorCard({ hex, delay = 0 }: ColorCardProps) {
  const [copied, setCopied] = useState(false);
  const rgb = hexToRgb(hex);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      viewport={{ once: true }}
    >
      <Card className="overflow-hidden">
        {/* Color Display Part */}
        <div className="relative h-32" style={{ backgroundColor: hex }}>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 bg-background/20 backdrop-blur-sm hover:bg-background/30 hover:text-foreground/80"
            onClick={copyToClipboard}
          >
            <Copy className="h-4 w-4" />
          </Button>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-14 right-2 rounded bg-foreground/80 px-2 py-1 text-primary-foreground text-xs"
            >
              Copied!
            </motion.div>
          )}
        </div>

        {/* Color Info Part */}
        <CardContent className="space-y-2 p-4">
          <div className="space-y-1">
            <p className="font-medium text-foreground/70 text-sm">
              RGB: R{rgb.r}, G{rgb.g}, B{rgb.b}
            </p>
            <p className="font-mono font-semibold text-foreground text-sm">
              HEX: {hex.toUpperCase()}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
