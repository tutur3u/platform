import type { ExtendedNovaSubmission } from '../types';

interface SubmissionDetailsProps {
  submission: ExtendedNovaSubmission;
}

export default function SubmissionDetails({
  submission,
}: SubmissionDetailsProps) {
  return (
    <div className="space-y-6 pt-2">
      {/* Solution */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Your Solution</h4>
        <div className="max-h-64 overflow-y-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">
          {submission.prompt || 'No solution provided'}
        </div>
      </div>
    </div>
  );
}
