// Initialize the chess pieces and their positions on the board

const horizontal = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const vertical = [1, 2, 3, 4, 5, 6, 7, 8];

interface Piece {
  id: string;
  image: string;
  x: number;
  y: number;
  type: PieceType;
  team: TeamType;
  firstMove: boolean;
  enPassant: boolean;
}

enum TeamType {
  OPPONENT = 'OPPONENT',
  OURS = 'OURS',
}

enum PieceType {
  PAWN = 'PAWN',
  ROOK = 'ROOK',
  KNIGHT = 'KNIGHT',
  BISHOP = 'BISHOP',
  QUEEN = 'QUEEN',
  KING = 'KING',
}

let pieces: Piece[] = [];

const initialPositions: Record<
  string,
  { type: PieceType; positions: number[] }
> = {
  ROOK: { type: PieceType.ROOK, positions: [1, 8] },
  KNIGHT: { type: PieceType.KNIGHT, positions: [2, 7] },
  BISHOP: { type: PieceType.BISHOP, positions: [3, 6] },
  QUEEN: { type: PieceType.QUEEN, positions: [4] },
  KING: { type: PieceType.KING, positions: [5] },
  PAWN: { type: PieceType.PAWN, positions: [1, 2, 3, 4, 5, 6, 7, 8] },
};

(function initializePieces() {
  for (let i = 1; i <= 2; i++) {
    const teamType = i === 1 ? TeamType.OPPONENT : TeamType.OURS;
    const colour = teamType === TeamType.OPPONENT ? 'b' : 'w';
    const y = teamType === TeamType.OPPONENT ? 1 : 8;
    const pawnY = teamType === TeamType.OPPONENT ? 2 : 7;

    Object.values(initialPositions).forEach((piece) => {
      piece.positions.forEach((x) => {
        const pieceY = piece.type === PieceType.PAWN ? pawnY : y;
        const id =
          colour === 'b'
            ? `dark-${piece.type.toLowerCase()}-${x}`
            : `light-${piece.type.toLowerCase()}-${x}`;
        pieces.push({
          id,
          image: `neo-chess/${colour}_${PieceType[piece.type].toLowerCase()}.png`,
          x,
          y: pieceY,
          type: piece.type,
          team: teamType,
          firstMove: true,
          enPassant: false,
        });
      });
    });
  }
})();

/**
 * Removes a piece from the board by its id.
 * @param id - The id of the piece to remove.
 * @param teamType - The team type of the piece to remove.
 */
function removePieceById(id: string, teamType: TeamType) {
  // Remove from pieces array
  const pieceIndex = pieces.findIndex((piece) => piece.id === id);
  if (pieceIndex !== -1) {
    pieces.splice(pieceIndex, 1);
  }

  // Remove from initialPositions
  Object.values(initialPositions).forEach((piece) => {
    piece.positions = piece.positions.filter((position) => {
      const positionId = `${position},${piece.type === PieceType.PAWN ? (teamType === TeamType.OPPONENT ? 2 : 7) : teamType === TeamType.OPPONENT ? 1 : 8}`;
      return positionId !== id;
    });
  });

  console.log('Updated pieces:', pieces);
}

export {
  PieceType,
  TeamType,
  horizontal,
  initialPositions,
  pieces,
  removePieceById,
  vertical,
};
export type { Piece };
