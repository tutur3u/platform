import { Clock, Globe } from 'lucide-react';
import { useState } from 'react';

interface TimezoneToggleProps {
  onToggle: (showLocalTime: boolean) => void;
  showLocalTime: boolean;
}

export default function TimezoneToggle({
  onToggle,
  showLocalTime,
}: TimezoneToggleProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return (
      <div className="mb-3 flex justify-center">
        <button
          type="button"
          onClick={() => setIsVisible(true)}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200"
        >
          <Globe className="h-4 w-4" />
          <span>Show timezone options</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-blue-800">
          <Globe className="h-4 w-4" />
          <span>Time Display Options</span>
        </div>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="text-blue-600 transition-colors hover:text-blue-800"
        >
          ×
        </button>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
            !showLocalTime
              ? 'bg-blue-600 text-white'
              : 'border border-blue-300 bg-white text-blue-600 hover:bg-blue-50'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Plan Timezone</span>
        </button>

        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
            showLocalTime
              ? 'bg-blue-600 text-white'
              : 'border border-blue-300 bg-white text-blue-600 hover:bg-blue-50'
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>Your Local Time</span>
        </button>
      </div>

      <div className="mt-2 text-center text-xs text-blue-700">
        {showLocalTime
          ? 'Times shown in your local timezone'
          : "Times shown in plan's original timezone"}
      </div>
    </div>
  );
}
