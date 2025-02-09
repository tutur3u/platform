import { PieceType, TeamType, pieces as initialPieces } from './pieceSetup';
import Referee from './referee';
import React, { useEffect, useRef, useState } from 'react';

export function useDragAndDrop(
  removePieceById: (id: string) => void,
  updatePiecePosition: (id: string, x: number, y: number) => void,
  promotePawn: (id: string, newType: PieceType) => void,
  checkmate: (team: TeamType) => void
) {
  const chessboardRef = useRef<HTMLDivElement>(null);
  let activePiece: HTMLElement | null = null;
  let hasMoved = useRef(false);
  const referee = new Referee();

  // Board state management
  const [boardState, setBoardState] = useState(initialPieces);

  // Promotion management
  const [promotionInfo, setPromotionInfo] = useState<{
    pieceId: string;
    column: number;
    row: number;
  } | null>(null);

  // Turn management
  const [currentTurn, setCurrentTurn] = useState<TeamType>(
    Math.random() < 0.5 ? TeamType.OURS : TeamType.OPPONENT
  );
  const [turnAnnouncement, setTurnAnnouncement] =
    useState<string>('Initializing...');
  useEffect(() => {
    const startingTeam = currentTurn;
    setTurnAnnouncement(
      startingTeam === TeamType.OURS
        ? 'Light moves first!'
        : 'Dark moves first!'
    );
  }, []);

  // Checkmate management
  const [checkmateInfo, setCheckmateInfo] = useState<{
    team: string;
  } | null>(null);

  const touchStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const fixPosition = useRef<{
    [key: string]: {
      column: number;
      row: number;
      x: number;
      y: number;
      firstMove: boolean;
    };
  }>({});
  const cellCenter = useRef<{
    nextColumn?: number;
    nextRow?: number;
    nextX?: number;
    nextY?: number;
  }>({});

  function grabPiece(e: React.MouseEvent) {
    e.preventDefault();
    if (e.target instanceof HTMLImageElement) {
      // If incorrect turn, don't allow to move
      const pieceId = e.target.id;
      const piece = boardState.find((p) => p.id === pieceId);
      let pieceTeam: TeamType | null = null;

      if (piece) {
        pieceTeam = piece.team;
      }
      if (pieceTeam !== currentTurn) {
        return;
      }

      // If correct turn, allow to move
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
        pieceTeam = pieceMatch[1] === 'w' ? TeamType.OURS : TeamType.OPPONENT;
        pieceType =
          PieceType[pieceMatch[2]!.toUpperCase() as keyof typeof PieceType];
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
          // Update the board state
          setBoardState(validMove.updatedBoardState);

          // Update the turn
          setCurrentTurn(
            pieceTeam === TeamType.OURS ? TeamType.OPPONENT : TeamType.OURS
          );
          setTurnAnnouncement(
            pieceTeam === TeamType.OURS ? "Black's turn!" : "White's turn!"
          );

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

          // King castling logic
          if (
            pieceType === PieceType.KING &&
            Math.abs(
              cellCenter.current.nextColumn -
                fixPosition.current[pieceId].column
            ) === 2
          ) {
            const rookCol = cellCenter.current.nextColumn === 7 ? 8 : 1;
            const newRookCol = cellCenter.current.nextColumn === 7 ? 6 : 4;
            const rook = boardState.find(
              (p) =>
                p.x === rookCol &&
                p.y === cellCenter.current.nextRow &&
                p.type === PieceType.ROOK &&
                p.team === pieceTeam
            );
            if (rook) {
              updatePiecePosition(
                rook.id,
                newRookCol,
                cellCenter.current.nextRow
              );
              const rookIndex = boardState.findIndex((p) => p.id === rook.id);
              if (rookIndex !== -1 && boardState[rookIndex]) {
                boardState[rookIndex].x = newRookCol;
                boardState[rookIndex].y = cellCenter.current.nextRow;
                boardState[rookIndex].firstMove = false;
              }
            }
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

          // Check for checkmate or stalemate
          const checkmateTeam = referee.checkForCheckmate(
            pieceTeam === TeamType.OURS ? TeamType.OPPONENT : TeamType.OURS,
            validMove.updatedBoardState
          );
          if (checkmateTeam) {
            setCheckmateInfo({ team: checkmateTeam });
            checkmate(checkmateTeam); // Call the checkmate function
            return;
          }

          const stalemateTeam = referee.checkForStalemate(
            pieceTeam === TeamType.OURS ? TeamType.OPPONENT : TeamType.OURS,
            validMove.updatedBoardState
          );
          if (stalemateTeam) {
            setCheckmateInfo({ team: '' });
            return;
          }
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

    console.log(boardState);
  }

  function handlePromotion(type: PieceType) {
    if (promotionInfo) {
      const pieceId = promotionInfo.pieceId;
      const piece = boardState.find((p) => p.id === pieceId);
      if (piece) {
        const oldX = piece.x;
        promotePawn(pieceId, type);
        setBoardState((prevBoardState) =>
          prevBoardState.map((p) =>
            p.id === pieceId
              ? {
                  ...p,
                  id: `${p.image.includes('b') ? 'dark' : 'light'}-${type.toLowerCase()}-${oldX}`,
                  type: type,
                  image: `/neo-chess/${p.team === TeamType.OURS ? 'w' : 'b'}_${type.toLowerCase()}.png`,
                }
              : p
          )
        );

        referee.isKingInDanger(piece!.team, boardState);
      }

      setPromotionInfo(null);
    }
  }

  function handleCheckmate(team: TeamType) {
    if (checkmateInfo) {
      checkmate(team);
      setCheckmateInfo(null);
    }
  }

  return {
    grabPiece,
    movePiece,
    dropPiece,
    chessboardRef,
    promotionInfo,
    handlePromotion,
    turnAnnouncement,
    checkmateInfo,
    handleCheckmate,
  };
}
