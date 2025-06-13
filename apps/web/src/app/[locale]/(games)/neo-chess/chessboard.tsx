'use client';

import CheckmateModal from './checkmate';
import Tile from './piece';
import {
  Piece,
  PieceType,
  TeamType,
  horizontal,
  pieces as initialPieces,
  vertical,
} from './pieceSetup';
import PromotionModal from './promotion';
import { useDragAndDrop } from './use-dnd';
import React, { useCallback, useState } from 'react';

export default function ChessBoard() {
  const [pieces, setPieces] = useState<Piece[]>(initialPieces);
  const [, setIsCheckmate] = useState<{ team: TeamType | null }>({
    team: null,
  });

  const removePieceById = useCallback((id: string) => {
    setPieces((prevPieces) => prevPieces.filter((piece) => piece.id !== id));
  }, []);

  const updatePiecePosition = useCallback(
    (id: string, x: number, y: number) => {
      setPieces((prevPieces) =>
        prevPieces.map((piece) =>
          piece.id === id ? { ...piece, x, y } : piece
        )
      );
    },
    []
  );

  const promotePawn = useCallback((id: string, newType: PieceType) => {
    setPieces((prevPieces) =>
      prevPieces.map((piece) =>
        piece.id === id
          ? {
              ...piece,
              id: `${piece.image.includes('b') ? 'dark' : 'light'}-${newType.toLowerCase()}-${piece.x}`,
              type: newType,
              image: `/neo-chess/${piece.team === TeamType.OURS ? 'w' : 'b'}_${newType.toLowerCase()}.png`,
            }
          : piece
      )
    );
  }, []);

  const checkmate = useCallback((team: TeamType) => {
    setIsCheckmate({ team });
  }, []);

  const {
    grabPiece,
    movePiece,
    dropPiece,
    chessboardRef,
    promotionInfo,
    handlePromotion,
    turnAnnouncement,
    checkmateInfo,
  } = useDragAndDrop(
    removePieceById,
    updatePiecePosition,
    promotePawn,
    checkmate
  );

  const handleRestart = () => {
    setPieces(initialPieces);
    setIsCheckmate({ team: null });
    window.location.reload(); // Reload the page to reset the useDragAndDrop hook
  };

  // Create the board
  let board: React.ReactNode[] = [];

  for (let i = 0; i <= horizontal.length + 1; i++) {
    const row: React.ReactNode[] = [];

    for (let j = 0; j <= vertical.length + 1; j++) {
      let piece = pieces.find((p) => p.x === j && p.y === i);

      if (i === 0 || i === horizontal.length + 1) {
        if (j === 0 || j === vertical.length + 1) {
          row.push(
            <div
              key={`${j},${i}`}
              className="relative flex aspect-square h-6 items-center justify-center md:h-9 lg:h-12"
            ></div>
          );
        } else {
          row.push(
            <div
              key={`${j},${i}`}
              className="relative flex aspect-square h-6 items-center justify-center md:h-9 lg:h-12"
            >
              {`${horizontal[j - 1]}`}
            </div>
          );
        }
      } else {
        if (j === 0 || j === vertical.length + 1) {
          row.push(
            <div
              key={`${j},${i}`}
              className="relative flex aspect-square h-6 items-center justify-center md:h-9 lg:h-12"
            >
              {`${vertical[vertical.length - i]}`}
            </div>
          );
        } else {
          const tileColor =
            (i % 2 !== 0 && j % 2 !== 0) || (i % 2 === 0 && j % 2 === 0)
              ? ''
              : 'bg-blue-200';
          row.push(
            <div
              key={`${j},${i}`}
              className={`relative flex aspect-square h-6 items-center justify-center ${tileColor} md:h-9 lg:h-12`}
            >
              {piece && (
                <Tile
                  id={piece.id}
                  image={piece.image}
                  type={piece.type}
                  team={piece.team}
                  firstMove={piece.firstMove}
                />
              )}
            </div>
          );
        }
      }
    }

    board.push(
      <div key={i} className="mx-auto grid w-fit grid-cols-10 divide-x">
        {row}
      </div>
    );
  }

  return (
    <div className="top-[50%] left-[50%] m-auto grid w-full max-w-sm p-6 sm:rounded-lg md:max-w-4xl lg:max-w-6xl">
      <div className="m-auto grid grid-cols-1 items-center justify-center">
        <div className="flex items-center justify-center text-lg font-medium uppercase">
          {turnAnnouncement}
        </div>

        <div className="w-full rounded-lg border bg-card p-4 text-card-foreground shadow-sm md:max-w-fit">
          <div
            className="relative divide-y"
            ref={chessboardRef}
            onMouseDown={grabPiece}
            onMouseMove={movePiece}
            onMouseUp={dropPiece}
          >
            {board}
            {promotionInfo && (
              <PromotionModal
                onSelect={handlePromotion}
                team={
                  pieces.find((piece) => piece.id === promotionInfo.pieceId)
                    ?.team ?? TeamType.OURS
                }
              />
            )}
            {checkmateInfo && (
              <CheckmateModal
                team={
                  checkmateInfo.team === null
                    ? 'Stalemate'
                    : checkmateInfo.team === TeamType.OURS
                      ? 'White'
                      : 'Black'
                }
                onRestart={handleRestart}
              />
            )}
          </div>
          <div
            data-orientation="horizontal"
            role="none"
            className="my-2 h-[1px] w-full shrink-0 bg-border md:my-4"
          ></div>
          <button
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-semibold whitespace-nowrap text-destructive-foreground ring-offset-background transition-colors hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            onClick={handleRestart}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
