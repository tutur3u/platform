import { CheckSquare } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { AssessmentPanel } from './assessment-panel';

export const liveAssessmentTool: MeetToolDefinition = {
  id: 'live-assessment',
  label: 'meet.call.live_activities.assessment.title',
  icon: CheckSquare,
  Panel: AssessmentPanel,
};
