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
      const checkRow = row - i * rowDirection;
      const checkCol = column - i * colDirection;

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

  private findKingPosition(
    team: TeamType,
    boardState: Piece[]
  ): { x: number; y: number } | null {
    const king = boardState.find(
      (p) => p.type === PieceType.KING && p.team === team
    );
    return king ? { x: king.x, y: king.y } : null;
  }

  private isKingInDanger(team: TeamType, boardState: Piece[]): boolean {
    const kingPosition = this.findKingPosition(team, boardState);
    if (!kingPosition) return false;

    return boardState.some((piece) => {
      if (piece.team !== team) {
        const { isValid } = this.isValidMove(
          piece.id,
          kingPosition.x,
          kingPosition.y,
          piece.x,
          piece.y,
          piece.type,
          piece.team,
          piece.firstMove,
          boardState,
          true
        );
        return isValid;
      }
      return false;
    });
  }

  private getPossibleMovesForPiece(
    piece: Piece,
    boardState: Piece[]
  ): Array<{ x: number; y: number }> {
    const possibleMoves: Array<{ x: number; y: number }> = [];

    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 9; y++) {
        const { isValid } = this.isValidMove(
          piece.id,
          x,
          y,
          piece.x,
          piece.y,
          piece.type,
          piece.team,
          piece.firstMove,
          boardState
        );

        if (isValid) {
          possibleMoves.push({ x, y });
        }
      }
    }

    return possibleMoves;
  }

  private simulateMove(
    boardState: Piece[],
    piece: Piece,
    move: { x: number; y: number }
  ): Piece[] {
    // Create a copy of the board state
    const newBoardState = boardState.map((p) => ({ ...p }));

    // Move the piece
    const pieceToMove = newBoardState.find((p) => p.id === piece.id);
    if (pieceToMove) {
      pieceToMove.x = move.x;
      pieceToMove.y = move.y;
      pieceToMove.firstMove = false;
    }

    return newBoardState;
  }

  private isCheckmate(team: TeamType, boardState: Piece[]): boolean {
    // Check if the king is in check
    if (!this.isKingInDanger(team, boardState)) {
      return false;
    }

    // Generate all pieces for the current team
    const playerPieces = boardState.filter((piece) => piece.team === team);

    // Check each piece for possible legal moves
    for (const piece of playerPieces) {
      const possibleMoves = this.getPossibleMovesForPiece(piece, boardState);

      for (const move of possibleMoves) {
        const simulatedBoardState = this.simulateMove(boardState, piece, move);
        if (!this.isKingInDanger(team, simulatedBoardState)) {
          return false;
        }
      }
    }

    // If no legal moves found, it's checkmate
    return true;
  }

  public checkForCheckmate(team: TeamType, boardState: Piece[]): boolean {
    return this.isCheckmate(team, boardState);
  }

  private castling(king: Piece, rook: Piece, boardState: Piece[]): boolean {
    const row = king.y;
    const colDirection = rook.x > king.x ? 1 : -1;
    const steps = Math.abs(rook.x - king.x);

    // Check if there is a barrier between the king and rook
    for (let i = 1; i < steps; i++) {
      const checkCol = king.x + i * colDirection;

      if (this.tileIsOccupied(checkCol, row, boardState)) {
        return false;
      }
    }

    // Check if the King passes through or ends up in a square under attack
    for (let i = 0; i <= 2; i++) {
      const checkCol = king.x + i * colDirection;
      const simulatedBoardState = boardState.map((p) =>
        p.id === king.id ? { ...p, x: checkCol } : p
      );
      if (this.isKingInDanger(king.team, simulatedBoardState)) {
        return false;
      }
    }

    return true;
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
    boardState: Piece[],
    simulate: boolean = false
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

    let isValid = false;

    const currPiece = boardState.find((p) => p.x === startX && p.y === startY);
    const pawnDirection = isOurTeam ? -1 : 1;

    if (!simulate && currPiece!.type !== PieceType.PAWN) {
      pieces.forEach((p) => {
        p.enPassant = false;
      });
    }

    if (type === PieceType.PAWN) {
      // Forward movement
      if (horizontalDistance === 0) {
        if (
          verticalDistance === pawnDirection &&
          !this.tileIsOccupied(column, row, boardState)
        ) {
          pieces.forEach((p) => {
            p.enPassant = false;
          });

          isValid = true;
        } else if (
          verticalDistance === 2 * pawnDirection &&
          firstMove &&
          !this.tileIsOccupied(column, row - pawnDirection, boardState) &&
          !this.tileIsOccupied(column, row, boardState)
        ) {
          pieces.forEach((p) => {
            p.enPassant = false;
          });

          if (currPiece!.type === PieceType.PAWN) {
            currPiece!.enPassant = true;
          }

          isValid = true;
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
          isValid = true;
        } else if (
          this.tileIsOccupiedByOpponent(column, row, team, boardState)
        ) {
          boardState = this.capturePiece(column, row, boardState);
          pieces.forEach((p) => {
            p.enPassant = false;
          });

          isValid = true;
        }
      }
    }
    
    else if (type === PieceType.KING) {
      if (
        Math.abs(verticalDistance) <= 1 &&
        Math.abs(horizontalDistance) <= 1
      ) {
        if (
          !this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState)
        ) {
          boardState = this.capturePiece(column, row, boardState);
          isValid = true;
        }
      }
      // Castling
      else if (
        firstMove &&
        isStraightMove &&
        Math.abs(horizontalDistance) === 2
      ) {
        const rookCol = horizontalDistance === 2 ? 8 : 1;
        const rookCastling = boardState.find(
          (p) =>
            p.x === rookCol &&
            p.y === row &&
            p.type === PieceType.ROOK &&
            p.team === team &&
            p.firstMove === true
        );

        if (
          rookCastling &&
          this.castling(currPiece!, rookCastling, boardState)
        ) {
          isValid = true;
        }
      }
    }
    
    else if (type === PieceType.BISHOP) {
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
        isValid = true;
      }
    }
    
    else if (type === PieceType.QUEEN) {
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
        isValid = true;
      }
    }
    
    else if (type === PieceType.KNIGHT) {
      if (
        ((Math.abs(horizontalDistance) === 1 &&
          Math.abs(verticalDistance) === 2) ||
          (Math.abs(horizontalDistance) === 2 &&
            Math.abs(verticalDistance) === 1)) &&
        (!this.tileIsOccupied(column, row, boardState) ||
          this.tileIsOccupiedByOpponent(column, row, team, boardState))
      ) {
        boardState = this.capturePiece(column, row, boardState);
        isValid = true;
      }
    }
    
    else if (type === PieceType.ROOK) {
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
        isValid = true;
      }
    }

    if (isValid) {
      const simulatedBoardState = boardState.map((p) =>
        p.id === pieceId ? { ...p, x: column, y: row } : p
      );

      if (!this.isKingInDanger(team, simulatedBoardState)) {
        return { isValid: true, updatedBoardState: boardState };
      }
    }

    return { isValid: false, updatedBoardState: boardState };
  }
}
