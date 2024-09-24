// Initialize the chess pieces and their positions on the board

const horizontal = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const vertical = [1, 2, 3, 4, 5, 6, 7, 8];

interface Piece {
    image: string;
    x: number;
    y: number;
}

const pieces: Piece[] = [];
const initialPositions = [
    { type: 'rook', positions: [1, 8] },
    { type: 'knight', positions: [2, 7] },
    { type: 'bishop', positions: [3, 6] },
    { type: 'queen', positions: [4] },
    { type: 'king', positions: [5] },
    { type: 'pawn', positions: [1, 2, 3, 4, 5, 6, 7, 8] }
];

for (let i = 1; i <= 2; i++) {
    const type = i === 1 ? 'b' : 'w';
    const y = i === 1 ? 1 : 8;
    const pawnY = i === 1 ? 2 : 7;

    initialPositions.forEach(piece => {
        piece.positions.forEach(x => {
            const pieceY = piece.type === 'pawn' ? pawnY : y;
            pieces.push({ image: `neo-chess/${type}_${piece.type}.png`, x, y: pieceY});
        });
    });
}

export { horizontal, vertical, pieces, initialPositions };