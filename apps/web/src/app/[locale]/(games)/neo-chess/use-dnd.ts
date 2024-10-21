import { PieceType, TeamType, pieces as initialPieces } from './pieceSetup';
import Referee from './referee';
import React, { useRef, useState } from 'react';

export function useDragAndDrop(
  removePieceById: (id: string) => void,
  updatePiecePosition: (id: string, x: number, y: number) => void,
  promotePawn: (id: string, newType: PieceType) => void
) {
  const chessboardRef = useRef<HTMLDivElement>(null);
  let activePiece: HTMLElement | null = null;
  let hasMoved = useRef(false);
  const referee = new Referee();
  const [boardState, setBoardState] = useState(initialPieces); // Initial board state
  const [promotionInfo, setPromotionInfo] = useState<{
    pieceId: string;
    column: number;
    row: number;
  } | null>(null); // State for promotion

  const touchStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const fixPosition = useRef<
    Record<
      string,
      { column: number; row: number; x: number; y: number; firstMove: boolean }
    >
  >({});
  const cellCenter = useRef<{
    nextColumn?: number;
    nextRow?: number;
    nextX?: number;
    nextY?: number;
  }>({});

  function grabPiece(e: React.MouseEvent) {
    e.preventDefault();
    if (e.target instanceof HTMLImageElement) {
      activePiece = e.target;
      touchStartPosition.current = { x: e.clientX, y: e.clientY };
      activePiece.style.position = 'absolute';
      activePiece.style.zIndex = '1';
      hasMoved.current = false;

      const chessboard = chessboardRef.current;
      if (chessboard) {
        const chessboardRect = chessboard.getBoundingClientRect();
        const cellSize = chessboardRect.width / 10;

        const column = Math.round(
          (activePiece.getBoundingClientRect().left - chessboardRect.left) /
            cellSize
        );
        const row = Math.round(
          (activePiece.getBoundingClientRect().top - chessboardRect.top) /
            cellSize
        );

        const initCellCenterX =
          chessboardRect.left + column * cellSize + cellSize / 2;
        const initCellCenterY =
          chessboardRect.top + row * cellSize + cellSize / 2;

        if (!fixPosition.current[activePiece.id]) {
          fixPosition.current[activePiece.id] = {
            column,
            row,
            x: initCellCenterX,
            y: initCellCenterY,
            firstMove: true,
          };
        }
      }
    }
  }

  function movePiece(e: React.MouseEvent) {
    const chessboard = chessboardRef.current;
    if (activePiece && chessboard) {
      const chessboardRect = chessboard.getBoundingClientRect();
      const cellSize = chessboardRect.width / 10;

      let currentLeftPosition = activePiece.getBoundingClientRect().left;
      let currentTopPosition = activePiece.getBoundingClientRect().top;

      const diffX = e.clientX - touchStartPosition.current.x;
      const diffY = e.clientY - touchStartPosition.current.y;

      let newLeft = activePiece.offsetLeft + diffX;
      let newTop = activePiece.offsetTop + diffY;

      if (currentLeftPosition - cellSize < chessboardRect.left) {
        newLeft =
          chessboardRect.left - currentLeftPosition + cellSize + newLeft;
      } else if (currentLeftPosition + 2 * cellSize > chessboardRect.right) {
        newLeft =
          newLeft - (currentLeftPosition + 2 * cellSize - chessboardRect.right);
      }

      if (currentTopPosition - cellSize < chessboardRect.top) {
        newTop = chessboardRect.top - currentTopPosition + cellSize + newTop;
      } else if (currentTopPosition + 2 * cellSize > chessboardRect.bottom) {
        newTop =
          newTop - (currentTopPosition + 2 * cellSize - chessboardRect.bottom);
      }

      activePiece.style.left = `${newLeft}px`;
      activePiece.style.top = `${newTop}px`;
      touchStartPosition.current = { x: e.clientX, y: e.clientY };

      const column = Math.round(
        (activePiece.getBoundingClientRect().left - chessboardRect.left) /
          cellSize
      );
      const row = Math.round(
        (activePiece.getBoundingClientRect().top - chessboardRect.top) /
          cellSize
      );

      const nextCellCenterX =
        chessboardRect.left + column * cellSize + cellSize / 2;
      const nextCellCenterY =
        chessboardRect.top + row * cellSize + cellSize / 2;

      cellCenter.current = {
        nextColumn: column,
        nextRow: row,
        nextX: nextCellCenterX,
        nextY: nextCellCenterY,
      };

      hasMoved.current = true;
    }
  }

  function dropPiece(_e: React.MouseEvent) {
    const chessboard = chessboardRef.current;

    if (activePiece && chessboard && hasMoved.current) {
      const pieceId = activePiece.id;
      const imageSrc = (activePiece as HTMLImageElement).src;
      const pieceMatch = imageSrc.match(/([bw])_(\w+)\.png$/);
      let pieceTeam: TeamType | null = null;
      let pieceType: PieceType | null = null;

      if (pieceMatch) {
        if (pieceMatch[1]) {
          const pieceTeamString =
            pieceMatch[1] === 'w' ? TeamType.OURS : TeamType.OPPONENT;
          pieceTeam = TeamType[pieceTeamString as keyof typeof TeamType];
        }
        if (pieceMatch[2]) {
          const pieceTypeString = pieceMatch[2].toUpperCase();
          pieceType = PieceType[pieceTypeString as keyof typeof PieceType];
        }
      }

      if (
        fixPosition.current[pieceId] &&
        cellCenter.current.nextColumn !== undefined &&
        cellCenter.current.nextRow !== undefined &&
        pieceType &&
        pieceTeam
      ) {
        const validMove = referee.isValidMove(
          pieceId,
          cellCenter.current.nextColumn,
          cellCenter.current.nextRow,
          fixPosition.current[pieceId].column,
          fixPosition.current[pieceId].row,
          pieceType,
          pieceTeam,
          fixPosition.current[pieceId].firstMove,
          boardState
        );

        if (validMove.isValid) {
          setBoardState(validMove.updatedBoardState);

          // Capture logic: Remove the captured piece based on position
          const isOurTeam = pieceTeam === TeamType.OURS;
          const pawnDirection = isOurTeam ? -1 : 1;
          const capturedPiece = boardState.find(
            (piece) =>
              piece.x === cellCenter.current.nextColumn &&
              piece.y ===
                (piece.enPassant
                  ? cellCenter.current.nextRow! - pawnDirection
                  : cellCenter.current.nextRow) &&
              piece.id !== pieceId
          );
          if (capturedPiece) {
            removePieceById(capturedPiece.id);
          }

          updatePiecePosition(
            pieceId,
            cellCenter.current.nextColumn,
            cellCenter.current.nextRow
          );

          // Update the pieces array
          const pieceIndex = boardState.findIndex((p) => p.id === pieceId);
          if (pieceIndex !== -1 && boardState[pieceIndex]) {
            boardState[pieceIndex].x = cellCenter.current.nextColumn;
            boardState[pieceIndex].y = cellCenter.current.nextRow;
            boardState[pieceIndex].firstMove = false;
          }

          // Pawn promotion logic
          if (
            pieceType === PieceType.PAWN &&
            (cellCenter.current.nextRow === 1 ||
              cellCenter.current.nextRow === 8)
          ) {
            setPromotionInfo({
              pieceId,
              column: cellCenter.current.nextColumn,
              row: cellCenter.current.nextRow,
            });
          }

          activePiece.style.position = 'static';
          activePiece.style.removeProperty('left');
          activePiece.style.removeProperty('top');

          fixPosition.current[pieceId] = {
            ...fixPosition.current[pieceId],
            column: cellCenter.current.nextColumn,
            row: cellCenter.current.nextRow,
            firstMove: false,
          };
        } else {
          // Revert to original position
          activePiece.style.position = 'static';
          activePiece.style.removeProperty('left');
          activePiece.style.removeProperty('top');
        }
      }
    }

    cellCenter.current = {
      nextColumn: undefined,
      nextRow: undefined,
      nextX: undefined,
      nextY: undefined,
    };

    activePiece = null;
  }

  function handlePromotion(type: PieceType) {
    if (promotionInfo) {
      promotePawn(promotionInfo.pieceId, type);
      setPromotionInfo(null);
    }
  }

  return {
    grabPiece,
    movePiece,
    dropPiece,
    chessboardRef,
    promotionInfo,
    handlePromotion,
  };
}
