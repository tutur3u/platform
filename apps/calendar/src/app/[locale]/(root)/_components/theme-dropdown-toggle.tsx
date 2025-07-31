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
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg bg-white shadow-sm transition-all duration-200 hover:bg-blue-50 hover:shadow-md dark:bg-gray-900 dark:hover:bg-blue-950/20"
        >
          <Sun className="dark:-rotate-90 h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all duration-200 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all duration-200 dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-lg border-0 bg-white p-2 shadow-xl dark:bg-gray-900"
      >
        <ThemeDropdownItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
