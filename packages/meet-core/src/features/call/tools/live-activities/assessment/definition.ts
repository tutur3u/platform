import { CheckSquare } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { AssessmentPanel } from './assessment-panel';

export const liveAssessmentTool: MeetToolDefinition = {
  id: 'live-assessment',
  label: 'Assessment',
  icon: CheckSquare,
  Panel: AssessmentPanel,
};
