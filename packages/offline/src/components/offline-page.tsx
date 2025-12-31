'use client';

export interface OfflinePageProps {
  /**
   * Title displayed on the offline page
   * @default "You're Offline"
   */
  title?: string;

  /**
   * Message displayed below the title
   * @default 'Please check your internet connection and try again.'
   */
  message?: string;

  /**
   * Text for the retry button
   * @default 'Try Again'
   */
  retryButtonText?: string;

  /**
   * Additional CSS classes to apply to the container
   */
  className?: string;
}

/**
 * A customizable offline fallback page component.
 *
 * @example
 * ```tsx
 * // In your app/~offline/page.tsx:
 * import { OfflinePage } from '@tuturuuu/offline/components';
 *
 * export default function Offline() {
 *   return (
 *     <OfflinePage
 *       title="You're Offline"
 *       message="Please check your connection."
 *       className="bg-background text-foreground"
 *     />
 *   );
 * }
 * ```
 */
export function OfflinePage({
  title = "You're Offline",
  message = 'Please check your internet connection and try again.',
  retryButtonText = 'Try Again',
  className = '',
}: OfflinePageProps) {
  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center ${className}`}
    >
      <div className="text-center">
        <h1 className="mb-4 font-bold text-4xl">{title}</h1>
        <p className="mb-8 opacity-70">{message}</p>
        <button
          onClick={handleRetry}
          type="button"
          className="rounded-lg bg-foreground px-6 py-3 text-background transition-opacity hover:opacity-90"
        >
          {retryButtonText}
        </button>
      </div>
    </div>
  );
}
