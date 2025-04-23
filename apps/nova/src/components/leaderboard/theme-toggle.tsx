'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Moon, Sun } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by rendering after mount
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className={cn('relative', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-50"
          >
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 1 }}
              animate={{ opacity: theme === 'dark' ? 0 : 1 }}
              transition={{ duration: 0.2 }}
            >
              <Sun className="h-4 w-4 text-yellow-400" />
            </motion.div>

            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: theme === 'dark' ? 1 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <Moon className="h-4 w-4 text-blue-400" />
            </motion.div>

            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="border-slate-700 bg-slate-900 text-slate-300 dark:border-slate-600 dark:bg-slate-800"
        >
          <DropdownMenuItem
            onClick={() => setTheme('light')}
            className="hover:bg-slate-800 hover:text-slate-50 dark:hover:bg-slate-700"
          >
            <Sun className="mr-2 h-4 w-4 text-yellow-400" />
            <span>Light</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme('dark')}
            className="hover:bg-slate-800 hover:text-slate-50 dark:hover:bg-slate-700"
          >
            <Moon className="mr-2 h-4 w-4 text-blue-400" />
            <span>Dark</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme('system')}
            className="hover:bg-slate-800 hover:text-slate-50 dark:hover:bg-slate-700"
          >
            <span className="mr-2 flex h-4 w-4 items-center justify-center">
              <span className="h-3 w-3 rounded-full bg-gradient-to-br from-yellow-400 to-blue-400"></span>
            </span>
            <span>System</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
