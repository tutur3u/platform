import { Timer } from '@tuturuuu/icons';

export default function TimeTrackerHeader() {
  return (
    <div className="space-y-4">
      {/* Main Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-purple-600 shadow-lg">
              <Timer className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
                Time Tracker
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Track and manage your time across projects
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
