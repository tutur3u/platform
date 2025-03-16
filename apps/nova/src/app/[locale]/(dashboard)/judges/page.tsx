import React from 'react';

export default function JudgesPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        Judging Challenges
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-full text-center">
          <p className="text-gray-500">Judges list is currently unavailable.</p>
        </div>
      </div>
    </div>
  );
}
