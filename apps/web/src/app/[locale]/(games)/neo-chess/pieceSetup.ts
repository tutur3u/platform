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
}

enum TeamType {
    OPPONENT = "OPPONENT",
    OURS = "OURS"
}

enum PieceType {
    PAWN = "PAWN",
    ROOK = "ROOK",
    KNIGHT = "KNIGHT",
    BISHOP = "BISHOP",
    QUEEN = "QUEEN",
    KING = "KING"
}

const pieces: Piece[] = [];
const initialPositions = [
    { type: PieceType.ROOK, positions: [1, 8] },
    { type: PieceType.KNIGHT, positions: [2, 7] },
    { type: PieceType.BISHOP, positions: [3, 6] },
    { type: PieceType.QUEEN, positions: [4] },
    { type: PieceType.KING, positions: [5] },
    { type: PieceType.PAWN, positions: [1, 2, 3, 4, 5, 6, 7, 8] }
];

for (let i = 1; i <= 2; i++) {
    const teamType = i === 1 ? TeamType.OPPONENT : TeamType.OURS;
    const colour = (teamType === TeamType.OPPONENT) ? 'b' : 'w';
    const y = (teamType === TeamType.OPPONENT) ? 1 : 8;
    const pawnY = (teamType === TeamType.OPPONENT) ? 2 : 7;

    initialPositions.forEach(piece => {
        piece.positions.forEach(x => {
            const pieceY = piece.type === PieceType.PAWN ? pawnY : y;
            pieces.push({
                id: `${x}, ${pieceY}`,
                image: `neo-chess/${colour}_${PieceType[piece.type].toLowerCase()}.png`,
                x,
                y: pieceY,
                type: piece.type,
                team: teamType,
                firstMove: false
            });
        });
    });
}

export { horizontal, vertical, pieces, initialPositions, PieceType, TeamType };
export type { Piece };