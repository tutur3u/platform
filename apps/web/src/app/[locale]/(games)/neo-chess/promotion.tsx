'use client';

import { PieceType, TeamType } from './pieceSetup';
import React from 'react';

interface PromotionModalProps {
  onSelect: (type: PieceType) => void;
  team: TeamType;
}

const PromotionModal: React.FC<PromotionModalProps> = ({ onSelect, team }) => {
  const pieceColor = team === TeamType.OURS ? 'w' : 'b';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">
          Choose a piece for promotion:
        </h3>
        <div className="flex space-x-4">
          <div className="flex flex-col items-center justify-center gap-2">
            <img
              className="h-14"
              src={`/neo-chess/${pieceColor}_queen.png`}
              alt="Queen"
            />
            <button
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => onSelect(PieceType.QUEEN)}
            >
              Queen
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-2">
            <img
              className="h-14"
              src={`/neo-chess/${pieceColor}_rook.png`}
              alt="Rook"
            />
            <button
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => onSelect(PieceType.ROOK)}
            >
              Rook
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-2">
            <img
              className="h-14"
              src={`/neo-chess/${pieceColor}_bishop.png`}
              alt="Bishop"
            />
            <button
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => onSelect(PieceType.BISHOP)}
            >
              Bishop
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-2">
            <img
              className="h-14"
              src={`/neo-chess/${pieceColor}_knight.png`}
              alt="Knight"
            />
            <button
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => onSelect(PieceType.KNIGHT)}
            >
              Knight
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromotionModal;
