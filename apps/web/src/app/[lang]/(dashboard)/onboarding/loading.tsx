import LoadingIndicator from '@/components/common/LoadingIndicator';

export default async function OnboardingPage() {
  return (
    <div className="inset-0 mx-4 flex min-h-screen items-center justify-center lg:mx-32">
      <div className="flex max-h-full w-full max-w-2xl flex-col items-center gap-4 rounded-xl border p-4 backdrop-blur-2xl md:p-8">
        <div className="flex h-full w-full items-center justify-center">
          <LoadingIndicator className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}
