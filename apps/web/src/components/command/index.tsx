'use client';

import { AddTaskForm } from './add-task-form';
import { CommandHeader } from './command-header';
import './command-palette.css';
import { Button } from '@tuturuuu/ui/button';
import { CommandDialog, CommandList } from '@tuturuuu/ui/command';
import { AlertTriangle, RefreshCw } from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';
import { CommandRoot } from './command-root';
import { QuickTimeTracker } from './quick-time-tracker';

const UUID_REGEX =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

// Function to extract workspace ID from pathname
function getWorkspaceFromPath(pathname: string): string | null {
  // Match pattern like /locale/wsId/... or /wsId/...
  const matches = pathname.match(new RegExp(`\\/(${UUID_REGEX.source})`));
  return matches?.[1] || null;
}

// Main Command Palette Component
export function CommandPalette({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [page, setPage] = React.useState('root');
  const [inputValue, setInputValue] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [errorBoundaryKey, setErrorBoundaryKey] = React.useState(0);

  const params = useParams();
  const pathname = usePathname();
  const { wsId: urlWsId } = params;

  // Try multiple methods to get workspace ID
  const workspaceId = React.useMemo(() => {
    // Method 1: From URL params (if it's a valid workspace ID)
    if (
      urlWsId &&
      typeof urlWsId === 'string' &&
      urlWsId !== 'undefined' &&
      (urlWsId === ROOT_WORKSPACE_ID ||
        urlWsId.match(new RegExp(`^${UUID_REGEX.source}$`)))
    ) {
      return urlWsId;
    }

    // Method 2: Extract from pathname
    const pathWorkspaceId = getWorkspaceFromPath(pathname);
    if (pathWorkspaceId) {
      return pathWorkspaceId;
    }

    return null;
  }, [urlWsId, pathname]);

  // Reset function for error boundary
  const resetErrorBoundary = React.useCallback(() => {
    setErrorBoundaryKey((prev) => prev + 1);
    setPage('root');
    setInputValue('');
    setIsLoading(false);
    setIsTransitioning(false);
  }, []);

  // Command palette no longer needs to fetch boards centrally
  // Each component fetches its own data as needed

  // Navigation handlers
  const handleBack = React.useCallback(() => {
    setIsTransitioning(true);
    setInputValue('');
    setTimeout(() => {
      setPage('root');
      setIsTransitioning(false);
    }, 150);
  }, []);

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setPage('root');
        setInputValue('');
        setIsTransitioning(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Enhanced keyboard event handling
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Command+K to toggle
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        // Check if user is typing in an input field
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement?.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        setOpen((currentOpen) => !currentOpen);
        return;
      }

      // Enhanced Escape key behavior - fixed to properly detect search input focus
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();

        // Check if the command input is focused and has value
        const commandInput = document.querySelector(
          '[cmdk-input]'
        ) as HTMLInputElement;
        const isCommandInputFocused =
          commandInput && document.activeElement === commandInput;

        // If search input is focused and has value, clear it first
        if (isCommandInputFocused && inputValue.trim()) {
          setInputValue('');
          return;
        }

        // If not on root page, go back to root
        if (page !== 'root') {
          handleBack();
          return;
        }

        // If on root with no input, close the modal
        setOpen(false);
        return;
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () =>
      document.removeEventListener('keydown', down, { capture: true });
  }, [setOpen, page, open, inputValue, handleBack]);

  // Navigation is now handled by individual components

  return (
    <CommandDialog open={open} onOpenChange={setOpen} showXIcon={false}>
      <CommandPaletteErrorBoundary
        key={errorBoundaryKey}
        onReset={resetErrorBoundary}
      >
        <CommandHeader
          page={page}
          inputValue={inputValue}
          setInputValue={setInputValue}
          isLoading={isLoading}
          isTransitioning={isTransitioning}
          onBack={handleBack}
          shouldAutoFocus={page !== 'time-tracker'}
        />

        <CommandList
          className={`${isTransitioning ? 'opacity-50 transition-opacity' : ''} max-h-[400px]`}
        >
          {page === 'root' && !isTransitioning && workspaceId && (
            <CommandRoot
              wsId={workspaceId}
              inputValue={inputValue}
              setOpen={setOpen}
              setPage={setPage}
            />
          )}

          {page === 'add-task' && !isTransitioning && workspaceId && (
            <div className="command-page-enter">
              <AddTaskForm
                wsId={workspaceId}
                setOpen={setOpen}
                setIsLoading={setIsLoading}
              />
            </div>
          )}

          {page === 'time-tracker' && !isTransitioning && workspaceId && (
            <div className="command-page-enter">
              <QuickTimeTracker
                wsId={workspaceId}
                setOpen={setOpen}
                setIsLoading={setIsLoading}
              />
            </div>
          )}

          {!workspaceId && !isTransitioning && (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="rounded-full bg-dynamic-orange/10 p-3">
                <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  No workspace found
                </p>
                <p className="text-sm text-muted-foreground">
                  Please navigate to a workspace to use the command palette
                </p>
              </div>
            </div>
          )}
        </CommandList>
      </CommandPaletteErrorBoundary>
    </CommandDialog>
  );
}

// Error boundary component for command palette
class CommandPaletteErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Command Palette Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-full bg-dynamic-red/10 p-4">
            <AlertTriangle className="h-8 w-8 text-dynamic-red" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">
              Something went wrong
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              The command palette encountered an unexpected error. Please try
              again.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Error details (development)
                </summary>
                <pre className="mt-2 rounded bg-dynamic-red/5 p-2 text-xs text-dynamic-red">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                this.props.onReset();
              }}
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Try Again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
