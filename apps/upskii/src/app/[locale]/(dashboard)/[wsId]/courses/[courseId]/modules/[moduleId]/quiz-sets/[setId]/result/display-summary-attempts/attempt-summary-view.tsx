'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  FileText,
  Hash,
  Timer,
  XCircle,
} from 'lucide-react';

export interface AttemptSummaryDTO {
  attemptId: string;
  attemptNumber: number;
  submittedAt: string | null;
  durationSeconds: number;
  questions: Array<{
    quizId: string;
    question: string;
    selectedOptionId: string | null;
    options: Array<{ id: string; value: string }>;
  }>;
}

export default function AttemptSummaryView({
  summary,
  backToTakeQuiz,
}: {
  summary: AttemptSummaryDTO;
  backToTakeQuiz: () => void;
}) {
  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '–';

  const fmtDur = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getSelectedOptionText = (
    question: AttemptSummaryDTO['questions'][0]
  ) => {
    if (!question.selectedOptionId) return null;
    const selectedOption = question.options.find(
      (opt) => opt.id === question.selectedOptionId
    );
    return selectedOption?.value || null;
  };

  const answeredQuestions = summary.questions.filter(
    (q) => q.selectedOptionId !== null
  ).length;
  const totalQuestions = summary.questions.length;
  const completionRate =
    totalQuestions > 0
      ? Math.round((answeredQuestions / totalQuestions) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2 md:p-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-primary">Attempt Summary</h1>
        <p className="text-secondary-foreground">
          Review your quiz attempt details and responses
        </p>
        <Button
          variant="outline"
          className="mt-3 border border-dynamic-purple bg-dynamic-purple/20 md:w-auto w-1/2"
          onClick={backToTakeQuiz}
        >
          Back to Quiz
        </Button>
      </div>

      {/* Attempt Overview */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-dynamic-light-purple" />
            Attempt #{summary.attemptNumber}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Submission Info */}
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-100 p-2">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Submitted</p>
                <p className="text-sm text-secondary-foreground">
                  {fmtDate(summary.submittedAt)}
                </p>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-light-purple/50 p-2">
                <Timer className="h-5 w-5 text-dynamic-light-purple" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Duration</p>
                <p className="text-sm text-secondary-foreground">
                  {fmtDur(summary.durationSeconds)}
                </p>
              </div>
            </div>

            {/* Completion Rate */}
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-orange/30 p-2">
                <FileText className="h-5 w-5 text-dynamic-light-orange" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Completion</p>
                <p className="text-sm text-secondary-foreground">
                  {answeredQuestions} of {totalQuestions} questions
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-secondary-foreground">
                Progress
              </span>
              <Badge variant={completionRate === 100 ? 'default' : 'secondary'}>
                {completionRate}%
              </Badge>
            </div>
            <Progress value={completionRate} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Questions Section */}
      {summary.questions && summary.questions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-secondary-foreground" />
            <h2 className="text-xl font-semibold text-primary">
              Questions & Responses
            </h2>
            <Badge variant="secondary">
              {summary.questions.length} questions
            </Badge>
          </div>

          <div className="grid gap-4">
            {summary.questions.map((q, index) => {
              const isAnswered = q.selectedOptionId !== null;
              const selectedOptionText = getSelectedOptionText(q);

              return (
                <Card
                  key={q.quizId}
                  className={`transition-all hover:shadow-md ${
                    isAnswered
                      ? 'border-dynamic-light-green/30 bg-dynamic-green/10'
                      : 'border-dynamic-light-orange bg-dynamic-light-orange/20'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="flex-1 text-base leading-relaxed font-medium">
                        <span className="mr-2 text-sm font-normal text-muted-foreground">
                          Q{index + 1}.
                        </span>
                        {q.question}
                      </CardTitle>
                      <div className="flex-shrink-0">
                        {isAnswered ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="mr-0.5 h-5 w-5 text-dynamic-green" />
                            <Badge
                              variant="default"
                              className="bg-dynamic-green"
                            >
                              Answered
                            </Badge>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-5 w-5 text-orange-500" />
                            <Badge
                              variant="secondary"
                              className="bg-orange-100 text-orange-700"
                            >
                              Skipped
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <Separator className="bg-muted-foreground" />

                    {/* Selected Answer */}
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-card-foreground">
                        Your Response:
                      </span>
                      {isAnswered && selectedOptionText ? (
                        <div className="mt-1 rounded-lg border border-dynamic-purple bg-dynamic-purple/20 p-3">
                          <div className="flex items-start gap-2">
                            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-primary">
                                {selectedOptionText}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-muted-foreground/40 bg-card p-3">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-orange-500" />
                            <span className="text-sm text-secondary-foreground italic">
                              No answer provided
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* All Options */}
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-secondary-foreground">
                        Available Options:
                      </span>
                      <div className="space-y-2.5">
                        {q.options.map((option) => {
                          const isSelected = option.id === q.selectedOptionId;
                          return (
                            <div
                              key={option.id}
                              className={`flex items-start gap-3 rounded-md border px-2.5 py-3 ${
                                isSelected
                                  ? 'border-dynamic-purple bg-dynamic-purple/20'
                                  : 'border-muted-foreground/40 bg-card'
                              }`}
                            >
                              <div
                                className={`mt-2 h-2 w-2 flex-shrink-0 rounded-full ${
                                  isSelected
                                    ? 'bg-dynamic-light-purple'
                                    : 'bg-gray-300'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm ${isSelected ? 'font-medium text-dynamic-light-purple' : 'text-secondary-foreground'}`}
                                >
                                  {option.value}
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle className="h-4 w-4 flex-shrink-0 text-dynamic-light-purple" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <Card className="border-dynamic-purple/60 bg-gradient-to-r from-dynamic-purple/20 to-dynamic-light-purple/10">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
            <div>
              <div className="text-2xl font-bold text-dynamic-light-purple">
                {summary.attemptNumber}
              </div>
              <div className="text-sm text-secondary-foreground">
                Attempt Number
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-dynamic-lime">
                {answeredQuestions}
              </div>
              <div className="text-sm text-secondary-foreground">
                Questions Answered
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-dynamic-light-cyan">
                {totalQuestions - answeredQuestions}
              </div>
              <div className="text-sm text-secondary-foreground">
                Questions Skipped
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-dynamic-light-orange">
                {fmtDur(summary.durationSeconds)}
              </div>
              <div className="text-sm text-secondary-foreground">
                Time Taken
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="text-center">
        <Button
          variant="outline"
          className="mt-3 w-full border border-dynamic-purple bg-dynamic-purple/20 md:w-auto"
          onClick={backToTakeQuiz}
        >
          Back to Quiz
        </Button>
      </div>
    </div>
  );
}
