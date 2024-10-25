'use client';

import React from 'react';

interface CheckmateModalProps {
  team: 'White' | 'Black';
  onRestart: () => void;
}

const CheckmateModal: React.FC<CheckmateModalProps> = ({ team, onRestart }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-96 rounded-lg bg-white p-6 shadow-lg">
        <h3 className="flex justify-center text-lg font-semibold">Game over</h3>
        <p className="my-4 flex justify-center text-base">
          {team} is checkmated!
        </p>
        <button
          className="ring-offset-background focus-visible:ring-ring bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          onClick={onRestart}
        >
          Restart
        </button>
      </div>
    </div>
  );
};

export default CheckmateModal;
