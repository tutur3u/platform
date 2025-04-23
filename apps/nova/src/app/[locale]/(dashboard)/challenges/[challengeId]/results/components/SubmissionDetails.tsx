import { ExtendedNovaSubmission } from '../types';

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
        <div className="bg-muted max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg p-3">
          {submission.prompt || 'No solution provided'}
        </div>
      </div>
    </div>
  );
}
