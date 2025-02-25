import CountdownTimer from './components/challengeButton';
import ProblemChanger from './problem-changer';
import LogoTitle from '@/app/[locale]/(marketing)/logo-title';
import NavbarSeparator from '@/app/[locale]/(marketing)/navbar-separator';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  proNum: number;
  currentProblem: number;
  createdAt: string;
  duration: number;
  wsId: string;
  challengeId: string;
  onNext: () => void;
  onPrev: () => void;
}

export default function CustomizedHeader({
  proNum,
  currentProblem,
  onNext,
  onPrev,
  wsId,
  challengeId,
  createdAt,
  duration,
}: Props) {
  const router = useRouter();

  const handleEndTest = async () => {
    const confirmEnd = window.confirm('Are you sure you want to end the test?');
    if (confirmEnd) {
      try {
        const response = await fetch(
          `/api/auth/workspace/${challengeId}/nova/start-test`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_status: 'END' }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to end test');
        }

        router.push(`/${wsId}/challenges/${challengeId}/test-ended`);
      } catch (error) {
        console.error('Error ending test:', error);
      }
    }
  };

  return (
    <nav
      id="navbar"
      className={cn('bg-foreground/2 fixed inset-x-0 top-0 z-50 shadow-sm')}
    >
      <div className="container mx-auto px-4 py-2 font-semibold">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/media/logos/transparent.png"
                className="h-8 w-8"
                width={32}
                height={32}
                alt="logo"
              />
              <LogoTitle />
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <ProblemChanger
              onPrev={onPrev}
              onNext={onNext}
              currentProblem={currentProblem}
              proNum={proNum}
            />
          </div>

          <div className="flex items-center gap-4">
            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
              }
            >
              <CountdownTimer
                problemId={currentProblem}
                createdAt={createdAt}
                wsId={wsId}
                duration={duration} // Fixed typo
              />
              <Button
                className="bg-red-500 hover:bg-red-700"
                onClick={handleEndTest}
              >
                End Test
              </Button>
            </Suspense>
          </div>
        </div>
      </div>
      <NavbarSeparator />
    </nav>
  );
}
