import { PieceType, TeamType, Piece } from "./pieceSetup";

export default class Referee {
    private lastPositions: Map<string, { x: number, y: number }> = new Map();

    tileIsOccupied(x: number, y: number, boardState: Piece[]): boolean {
        return boardState.some(piece => piece.x === x && piece.y === y);
    }

    tileIsOccupiedByOpponent(x: number, y: number, team: TeamType, boardState: Piece[]): boolean {
        const piece = boardState.find(p => p.x === x && p.y === y);
        return piece !== undefined && piece.team !== team;
    }

    isValidMove(
        pieceId: string,
        column: number, row: number,
        prevX: number, prevY: number,
        currX: number, currY: number,
        cellSize: number,
        type: PieceType, team: TeamType, firstMove: boolean,
        boardState: Piece[]
    ) {
        /*
        *  Get the last position of the piece
        *  If it is the first move, there should be no last position
        *  If it is not the first move, there should be a last
        *  When rebuilding but not refreshing the page, the lastPosition is reset to undefined
        */
        const lastPosition = this.lastPositions.get(pieceId);
        const isOurTeam = team === TeamType.OURS;
        
        const startX = firstMove ? prevX : (lastPosition ? lastPosition.x : prevX);
        const startY = firstMove ? prevY : (lastPosition ? lastPosition.y : prevY);

        const verticalDistance = Math.round(currY - startY);
        const horizontalDistance = Math.abs(currX - startX);

        if (type === PieceType.PAWN) {
            const pawnDirection = isOurTeam ? -1 : 1;

            // MOVEMENT LOGIC
            if (horizontalDistance === 0 && verticalDistance * pawnDirection > 0) {
                if (firstMove) {
                    if (Math.abs(verticalDistance) <= Math.round(cellSize * 2)) {
                        const intermediateRow = isOurTeam ? row + 1 : row - 1;
                        if (!this.tileIsOccupied(column, row, boardState) && (Math.abs(verticalDistance) === Math.round(cellSize) || !this.tileIsOccupied(column, intermediateRow, boardState))) {
                            this.lastPositions.set(pieceId, { x: currX, y: currY });
                            return true;
                        }
                    }
                } else {
                    if (Math.abs(verticalDistance) === Math.round(cellSize) && !this.tileIsOccupied(column, row, boardState)) {
                        this.lastPositions.set(pieceId, { x: currX, y: currY });
                        return true;
                    }
                }
            }

            // ATTACK LOGIC
            else if (Math.round(horizontalDistance) === Math.round(cellSize) && Math.abs(verticalDistance) === Math.round(cellSize) && verticalDistance * pawnDirection > 0) {
                if (this.tileIsOccupiedByOpponent(column, row, team, boardState)) {
                    this.lastPositions.set(pieceId, { x: currX, y: currY });
                    return true;
                }
            }
        }
        else if (type === PieceType.KING) {

            if (Math.round(verticalDistance) <= Math.round(cellSize) && Math.round(horizontalDistance) <= Math.round(cellSize)) {
                if (!this.tileIsOccupied(column, row, boardState)                   // MOVEMENT LOGIC
                    || this.tileIsOccupiedByOpponent(column, row, team, boardState) // ATTACK LOGIC
                ) {
                    this.lastPositions.set(pieceId, { x: currX, y: currY });
                    return true;
                }
            }
        }

        return false;
    }
}