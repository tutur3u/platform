import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Moon, Sun } from '@tuturuuu/ui/icons';
import { ThemeDropdownItems } from './theme-dropdown-items';

export function ThemeDropdownToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeDropdownItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
