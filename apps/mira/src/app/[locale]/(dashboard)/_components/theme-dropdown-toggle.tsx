import { ThemeDropdownItems } from './theme-dropdown-items';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tutur3u/ui/components/ui/dropdown-menu';
import { Moon, Sun } from 'lucide-react';

export function ThemeDropdownToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeDropdownItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
