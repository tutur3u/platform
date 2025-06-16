'use client';

import ShowAttemptDetailSection, {
  AttemptDetailDTO,
} from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/result/display-results/show-attempt-detail-section';
import ShowResultSummarySection from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/result/display-results/show-result-summary-section';
import AttemptSummaryView, {
  AttemptSummaryDTO,
} from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/result/display-summary-attempts/attempt-summary-view';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// const dummyAttemptDetail: AttemptDetailDTO = {
//   attemptId: "att_123456",
//   attemptNumber: 1,
//   totalScore: 75,
//   maxPossibleScore: 100,
//   startedAt: "2024-03-20T10:00:00Z",
//   completedAt: "2024-03-20T10:15:30Z",
//   durationSeconds: 930, // 15 minutes and 30 seconds
//   explanationMode: 2, // 0: no explanations, 1: only correct answers, 2: all explanations
//   questions: [
//     {
//       quizId: "q_1",
//       question: "What is the capital of France?",
//       scoreWeight: 25,
//       selectedOptionId: "opt_2",
//       isCorrect: true,
//       scoreAwarded: 25,
//       options: [
//         {
//           id: "opt_1",
//           value: "London",
//           isCorrect: false,
//           explanation: "London is the capital of the United Kingdom, not France."
//         },
//         {
//           id: "opt_2",
//           value: "Paris",
//           isCorrect: true,
//           explanation: "Paris is the capital and largest city of France."
//         },
//         {
//           id: "opt_3",
//           value: "Berlin",
//           isCorrect: false,
//           explanation: "Berlin is the capital of Germany, not France."
//         },
//         {
//           id: "opt_4",
//           value: "Madrid",
//           isCorrect: false,
//           explanation: "Madrid is the capital of Spain, not France."
//         }
//       ]
//     },
//     {
//       quizId: "q_2",
//       question: "Which planet is known as the Red Planet?",
//       scoreWeight: 25,
//       selectedOptionId: "opt_6",
//       isCorrect: false,
//       scoreAwarded: 25,
//       options: [
//         {
//           id: "opt_5",
//           value: "Mars",
//           isCorrect: true,
//           explanation: "Mars is called the Red Planet because of its reddish appearance due to iron oxide on its surface."
//         },
//         {
//           id: "opt_6",
//           value: "Venus",
//           isCorrect: false,
//           explanation: "Venus is often called Earth's twin due to its similar size and mass."
//         },
//         {
//           id: "opt_7",
//           value: "Jupiter",
//           isCorrect: false,
//           explanation: "Jupiter is the largest planet in our solar system."
//         }
//       ]
//     },
//     {
//       quizId: "q_3",
//       question: "What is the chemical symbol for gold?",
//       scoreWeight: 25,
//       selectedOptionId: "opt_9",
//       isCorrect: true,
//       scoreAwarded: 25,
//       options: [
//         {
//           id: "opt_8",
//           value: "Ag",
//           isCorrect: false,
//           explanation: "Ag is the chemical symbol for silver."
//         },
//         {
//           id: "opt_9",
//           value: "Au",
//           isCorrect: true,
//           explanation: "Au comes from the Latin word 'aurum' meaning gold."
//         },
//         {
//           id: "opt_10",
//           value: "Fe",
//           isCorrect: false,
//           explanation: "Fe is the chemical symbol for iron."
//         }
//       ]
//     },
//     {
//       quizId: "q_4",
//       question: "Who painted the Mona Lisa?",
//       scoreWeight: 25,
//       selectedOptionId: null,
//       isCorrect: false,
//       scoreAwarded: 0,
//       options: [
//         {
//           id: "opt_11",
//           value: "Leonardo da Vinci",
//           isCorrect: true,
//           explanation: "Leonardo da Vinci painted the Mona Lisa between 1503 and 1519."
//         },
//         {
//           id: "opt_12",
//           value: "Vincent van Gogh",
//           isCorrect: false,
//           explanation: "Van Gogh is known for works like 'Starry Night' and 'Sunflowers'."
//         },
//         {
//           id: "opt_13",
//           value: "Pablo Picasso",
//           isCorrect: false,
//           explanation: "Picasso is known for works like 'Guernica' and pioneering Cubism."
//         }
//       ]
//     }
//   ]
// };

type ApiResponse = AttemptSummaryDTO | AttemptDetailDTO;

export default function QuizResultPage({
  params: { wsId, courseId, moduleId, setId },
}: {
  params: {
    wsId: string;
    courseId: string;
    moduleId: string;
    setId: string;
  };
}) {
  const t = useTranslations();
  const router = useRouter();
  const search = useSearchParams();
  const attemptId = search.get('attemptId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiResponse | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setError(t('ws-quizzes.no_attempt_specified') || 'No attempt specified');
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/quiz-sets/${setId}/attempts/${attemptId}`,
          { cache: 'no-store' }
        );
        const json = await res.json();

        if (!res.ok) {
          setError(
            json.error ||
              t('ws-quizzes.failed_load') ||
              'Failed to load results'
          );
        } else {
          setDetail(json);
        }
      } catch {
        setError(t('ws-quizzes.network_error') || 'Network error');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [attemptId, wsId, setId, t]);

  const backToTakeQuizPage = () => {
    router.push(
      `/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets/${setId}/take`
    );
  };

  if (loading) {
    return <LoadingIndicator />;
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  if (!detail) {
    // Shouldn't happen, but guard anyway
    return null;
  }

  if ('totalScore' in detail) {
    return (
      <div className="space-y-8 p-6">
        {/* Summary */}
        <ShowResultSummarySection
          submitResult={{
            attemptNumber: detail.attemptNumber,
            totalScore: detail.totalScore,
            maxPossibleScore: detail.maxPossibleScore,
          }}
          quizMeta={{
            attemptLimit: null, // or fetch/passthrough as needed
            setName: '', // you can pass down setName if desired
            attemptsSoFar: 0,
            timeLimitMinutes: null,
            completedAt: detail.completedAt || null, // Optional, if you want to show when the quiz was completed
          }}
          wsId={wsId}
          courseId={courseId}
          moduleId={moduleId}
          setId={setId}
        />

        {/* Detailed per-question breakdown */}
        <ShowAttemptDetailSection detail={detail} />
      </div>
    );
  }

  return (
    <AttemptSummaryView summary={detail} backToTakeQuiz={backToTakeQuizPage} />
  );

  // return (
  //   <div className="space-y-8 p-6">
  //     {/* Summary */}
  //     <ShowResultSummarySection
  //       submitResult={{
  //         attemptNumber: dummyAttemptDetail.attemptNumber,
  //         totalScore: dummyAttemptDetail.totalScore,
  //         maxPossibleScore: dummyAttemptDetail.maxPossibleScore,
  //       }}
  //       quizMeta={{
  //         completedAt: dummyAttemptDetail.completedAt,
  //         attemptLimit: null, // or fetch/passthrough as needed
  //         setName: '', // you can pass down setName if desired
  //         attemptsSoFar: 0,
  //         timeLimitMinutes: null,
  //       }}
  //       wsId={wsId}
  //       courseId={courseId}
  //       moduleId={moduleId}
  //       setId={setId}
  //     />

  //     {/* Detailed per-question breakdown */}
  //     <ShowAttemptDetailSection detail={dummyAttemptDetail} />
  //   </div>
  // );
}
