import { PieceType, TeamType, Piece } from "./pieceSetup";

export default class Referee {
    private lastPositions: Map<string, { x: number, y: number }> = new Map();

    tileIsOccupied(x: number, y: number, boardState: Piece[]): boolean {
        const piece = boardState.find(piece => piece.x === x && piece.y === y);
        if (piece) {
            return true;
        } else {
            return false;
        }
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

        if (type === PieceType.PAWN) {
            const isOurTeam = team === TeamType.OURS;
            const pawnDirection = isOurTeam ? -1 : 1;
            const moveDistance = Math.round(currY - prevY);
        
            if (currX - prevX === 0 && moveDistance * pawnDirection > 0) {
                if (firstMove) {
                    if (Math.abs(moveDistance) === Math.round(cellSize)) {
                        if (!this.tileIsOccupied(column, row, boardState)) {
                            this.lastPositions.set(pieceId, { x: currX, y: currY });
                            return true;
                        }
                    } else if (Math.abs(moveDistance) === Math.round(cellSize * 2)) {
                        const intermediateRow = isOurTeam ? row + 1 : row - 1;
                        if (!this.tileIsOccupied(column, row, boardState) && 
                            !this.tileIsOccupied(column, intermediateRow, boardState)) {
                            this.lastPositions.set(pieceId, { x: currX, y: currY });
                            return true;
                        }
                    }
                } else {
                    if (lastPosition) {
                        const lastMoveDistance = Math.round(currY - lastPosition.y);
                        if (lastMoveDistance * pawnDirection > 0 && 
                            Math.abs(lastMoveDistance) === Math.round(cellSize)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
}