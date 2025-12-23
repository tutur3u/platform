import { AlertCircle } from '@tuturuuu/icons';

interface ValidationErrorsProps {
  errors: Record<string, string>;
}

export function ValidationErrors({ errors }: ValidationErrorsProps) {
  if (Object.keys(errors).length === 0) return null;

  return (
    <div className="rounded-lg bg-dynamic-red/10 p-3" aria-live="polite">
      {Object.values(errors).map((error, index) => (
        <div
          key={index}
          className="flex items-start gap-2 text-dynamic-red text-sm"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      ))}
    </div>
  );
}
