import { Clock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useTimezonePreference } from './use-timezone-preference';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useState } from 'react';

dayjs.extend(timezone);
dayjs.extend(utc);

// Component to display timezone information with toggle
export default function TimezoneIndicator({ plan }: { plan: MeetTogetherPlan }) {
  const [isVisible, setIsVisible] = useTimezonePreference();
  const [showDetails, setShowDetails] = useState(false);
  
  const userTimezone = dayjs.tz.guess();
  const userOffset = dayjs().tz(userTimezone).format('Z');
  
  // Extract plan timezone offset from start_time
  const planOffset = plan.start_time?.split(/[+-]/)?.[1];
  const planOffsetFormatted = planOffset ? 
    `${plan.start_time?.includes('-') ? '-' : '+'}${planOffset}` : 
    'Unknown';

  // Calculate time difference
  // Parse user offset (format: "+08:00" or "-05:00")
  const userOffsetSign = userOffset.startsWith('-') ? -1 : 1;
  const userOffsetHours = parseInt(userOffset.replace(/[^0-9]/g, '').substring(0, 2));
  const userOffsetNum = userOffsetSign * userOffsetHours;
  
  // Parse plan offset (format: "08" or "-05")
  const planOffsetNum = planOffset ? 
    parseInt(planOffset) * (plan.start_time?.includes('-') ? -1 : 1) : 0;
  
  const timeDifference = userOffsetNum - planOffsetNum;
  
  const timeDiffFormatted = timeDifference > 0 ? 
    `+${timeDifference} hours ahead` : 
    timeDifference < 0 ? 
    `${Math.abs(timeDifference)} hours behind` : 
    'same time';

  if (!isVisible) {
    return (
      <div className="mb-3 flex justify-center">
        <button
          type="button"
          onClick={() => setIsVisible(true)}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <Eye className="h-4 w-4" />
          <span>Show timezone info</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg bg-blue-50 p-3 text-sm border border-blue-200">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-blue-800 font-medium">
          <Clock className="h-4 w-4" />
          <span>Timezone Information</span>
        </div>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="text-blue-600 hover:text-blue-800 transition-colors"
        >
          <EyeOff className="h-4 w-4" />
        </button>
      </div>

      {/* Basic timezone info */}
      <div className="flex items-center justify-center gap-4 text-blue-800">
        <div className="flex items-center gap-2">
          <span role="img" aria-label="clock" className="text-base">🕒</span>
          <span className="font-medium">Your timezone:</span>
          <span className="font-semibold">{userTimezone} (UTC{userOffset})</span>
        </div>
        <ArrowRight className="h-4 w-4 text-blue-600" />
        <div className="flex items-center gap-2">
          <span role="img" aria-label="calendar" className="text-base">📅</span>
          <span className="font-medium">Plan timezone:</span>
          <span className="font-semibold">UTC{planOffsetFormatted}</span>
        </div>
      </div>

      {/* Time difference and details toggle */}
      <div className="mt-2 flex items-center justify-center gap-4">
        <div className="text-blue-700">
          <span className="font-medium">Time difference: </span>
          <span className="font-semibold">{timeDiffFormatted}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 hover:text-blue-800 text-xs underline transition-colors"
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {/* Detailed timezone information */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-blue-700">
            <div>
              <div className="font-medium mb-1">Your Local Timezone:</div>
              <div className="space-y-1">
                <div>• Name: {userTimezone}</div>
                <div>• Offset: UTC{userOffset}</div>
                <div>• Current time: {dayjs().tz(userTimezone).format('HH:mm:ss')}</div>
              </div>
            </div>
            <div>
              <div className="font-medium mb-1">Plan Timezone:</div>
              <div className="space-y-1">
                <div>• Offset: UTC{planOffsetFormatted}</div>
                <div>• Plan start: {plan.start_time}</div>
                <div>• Plan end: {plan.end_time}</div>
              </div>
            </div>
          </div>
          
          {/* Example conversion */}
          {plan.start_time && (
            <div className="mt-3 p-2 bg-blue-100 rounded text-xs">
              <div className="font-medium mb-1">Example Conversion:</div>
              <div className="flex items-center gap-2">
                <span>Plan time: {plan.start_time}</span>
                <ArrowRight className="h-3 w-3" />
                <span>Your time: {dayjs().tz(userTimezone).format('HH:mm')} (current)</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 