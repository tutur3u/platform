import { Moon, Sun } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ThemeDropdownItems } from './theme-dropdown-items';

export function ThemeDropdownToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-lg border-gray-200 bg-white shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600 dark:hover:bg-blue-950/20"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all duration-200 dark:-rotate-90 dark:scale-0" />
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
