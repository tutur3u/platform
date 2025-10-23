export function SuccessBanner() {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <p className="font-semibold text-green-900">✅ SDK Working!</p>
      <p className="mt-1 text-green-800 text-sm">
        The Tuturuuu SDK successfully connected and retrieved your workspace
        files.
      </p>
    </div>
  );
}
