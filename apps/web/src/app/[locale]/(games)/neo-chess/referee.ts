import { Piece, PieceType, TeamType, pieces } from './pieceSetup';

export default class Referee {
  private lastPositions: Map<
    string,
    { x: number; y: number; column: number; row: number }
  > = new Map();

  tileIsOccupied(x: number, y: number, boardState: Piece[]): boolean {
    return boardState.some((p) => p.x === x && p.y === y);
  }

  tileIsOccupiedByOpponent(
    x: number,
    y: number,
    team: TeamType,
    boardState: Piece[]
  ): boolean {
    const piece = boardState.find((p) => p.x === x && p.y === y);
    return piece !== undefined && piece.team !== team;
  }

  // Assuming you have a function to handle piece capture
  capturePiece(x: number, y: number, boardState: Piece[]): Piece[] {
    return boardState.filter((p) => !(p.x === x && p.y === y));
  }

  private isPathClear(
    verticalDistance: number,
    horizontalDistance: number,
    boardState: Piece[],
    row: number,
    column: number
  ): boolean {
    const rowDirection =
      verticalDistance === 0 ? 0 : verticalDistance > 0 ? 1 : -1;
    const colDirection =
      horizontalDistance === 0 ? 0 : horizontalDistance > 0 ? 1 : -1;
    const steps =
      verticalDistance !== 0
        ? Math.abs(verticalDistance)
        : Math.abs(horizontalDistance);

    for (let i = 1; i < steps; i++) {
      let checkRow = 0;
      let checkCol = 0;

      checkRow = row - i * rowDirection;
      checkCol = column - i * colDirection;

      if (this.tileIsOccupied(checkCol, checkRow, boardState)) {
        return false;
      }
    }

    return true;
  }

  private isEnPassantMove(
    column: number,
    row: number,
    team: TeamType,
    boardState: Piece[]
  ): boolean {
    const enPassantDirection = team === TeamType.OURS ? -1 : 1;
    const enPassantRow = row - enPassantDirection;
    const adjacentPawn = boardState.find(
      (p) => p.x === column && p.y === enPassantRow && p.type === PieceType.PAWN
    );

    return adjacentPawn !== undefined && adjacentPawn.enPassant;
  }

  isValidMove(
    pieceId: string,
    column: number,
    row: number,
    prevX: number,
    prevY: number,
    type: PieceType,
    team: TeamType,
    firstMove: boolean,
    boardState: Piece[]
  ): { isValid: boolean; updatedBoardState: Piece[] } {
    const lastPosition = this.lastPositions.get(pieceId);
    const isOurTeam = team === TeamType.OURS;

    const startX = firstMove ? prevX : lastPosition ? lastPosition.x : prevX;
    const startY = firstMove ? prevY : lastPosition ? lastPosition.y : prevY;

    const verticalDistance = row - Math.round(startY);
    const horizontalDistance = column - Math.round(startX);

    const isDiagonalMove =
      Math.abs(horizontalDistance) === Math.abs(verticalDistance);
    const isStraightMove =
      (horizontalDistance === 0 && verticalDistance !== 0) ||
      (verticalDistance === 0 && horizontalDistance !== 0);

    if (type !== PieceType.PAWN) {
      pieces.forEach((p) => {
        p.enPassant = false;
      });
    }
    if (type === PieceType.PAWN) {
      const pawnDirection = isOurTeam ? -1 : 1;

      // Forward movement
      if (horizontalDistance === 0) {
        const possibleEnPassant = boardState.find(
          (p) => p.firstMove && p.enPassant && p.type === PieceType.PAWN
        );

        const currPawn = boardState.find(
          (p) => p.x === startX && p.y === startY && p.type === PieceType.PAWN
        );

        if (currPawn!.x - pawnDirection !== possibleEnPassant?.x) {
          pieces.forEach((p) => {
            p.enPassant = false;
          });
        }

        if (
          verticalDistance === pawnDirection &&
          !this.tileIsOccupied(column, row, boardState)
        ) {
          return { isValid: true, updatedBoardState: boardState };
        } else if (
          verticalDistance === 2 * pawnDirection &&
          firstMove &&
          !this.tileIsOccupied(column, row - pawnDirection, boardState) &&
          !this.tileIsOccupied(column, row, boardState)
        ) {
          if (currPawn) {
            currPawn.enPassant = true;
          }
          return { isValid: true, updatedBoardState: boardState };
        }
      }
      // Diagonal capture
      else if (
        Math.abs(horizontalDistance) === 1 &&
        verticalDistance === pawnDirection
      ) {
        if (this.isEnPassantMove(column, row, team, boardState)) {
          boardState = this.capturePiece(
            column,
            row - pawnDirection,
            boardState
          );
          return { isValid: true, updatedBoardState: boardState };
        } else if (
          this.tileIsOccupiedByOpponent(column, row, team, boardState)
        ) {
          boardState = this.capturePiece(column, row, boardState);
          return { isValid: true, updatedBoardState: boardState };
        }
      }
    } else if (type === PieceType.KING) {
      if (
        Math.abs(verticalDistance) <= 1 &&
        Math.abs(horizontalDistance) <= 1
      ) {
        if (
          !this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState)
        ) {
          boardState = this.capturePiece(column, row, boardState);
          return { isValid: true, updatedBoardState: boardState };
        }
      }
    } else if (type === PieceType.BISHOP) {
      if (
        isDiagonalMove &&
        this.isPathClear(
          verticalDistance,
          horizontalDistance,
          boardState,
          row,
          column
        ) &&
        (!this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState))
      ) {
        boardState = this.capturePiece(column, row, boardState);
        return { isValid: true, updatedBoardState: boardState };
      }
    } else if (type === PieceType.QUEEN) {
      if (
        (isDiagonalMove || isStraightMove) &&
        this.isPathClear(
          verticalDistance,
          horizontalDistance,
          boardState,
          row,
          column
        ) &&
        (!this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState))
      ) {
        boardState = this.capturePiece(column, row, boardState);
        return { isValid: true, updatedBoardState: boardState };
      }
    } else if (type === PieceType.KNIGHT) {
      if (
        ((Math.abs(horizontalDistance) === 1 &&
          Math.abs(verticalDistance) === 2) ||
          (Math.abs(horizontalDistance) === 2 &&
            Math.abs(verticalDistance) === 1)) &&
        (!this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState))
      ) {
        boardState = this.capturePiece(column, row, boardState);
        return { isValid: true, updatedBoardState: boardState };
      }
    } else if (type === PieceType.ROOK) {
      if (
        isStraightMove &&
        this.isPathClear(
          verticalDistance,
          horizontalDistance,
          boardState,
          row,
          column
        ) &&
        (!this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState))
      ) {
        boardState = this.capturePiece(column, row, boardState);
        return { isValid: true, updatedBoardState: boardState };
      }
    }

    return { isValid: false, updatedBoardState: boardState };
  }
}
