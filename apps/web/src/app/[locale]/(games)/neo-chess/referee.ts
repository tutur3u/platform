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

        /** CONSUMING OUR TEAM IS WHITE **/
        if (team === TeamType.OURS) {
            if (type === PieceType.PAWN) {
                if (!lastPosition && !firstMove) {
                    console.log("Error: No last position for non-first move");
                    return false;
                }
                
                if (currX - prevX === 0 && currY - prevY < 0) {
                    if (firstMove) {
                        if (Math.round(currY - prevY) === - Math.round(cellSize)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        } else if (Math.round(currY - prevY) === - Math.round(cellSize * 2)) {
                            if (!this.tileIsOccupied(column, row, boardState) && !this.tileIsOccupied(column, row + 1, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        }
                    } else {
                        if (lastPosition && currY < lastPosition.y && Math.round(currY - lastPosition.y) === - Math.round(cellSize)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        } else {
                            return false;
                        }
                    }
                }
            }
        } else {
            if (type === PieceType.PAWN) {
                if (!lastPosition && !firstMove) {
                    console.log("Error: No last position for non-first move");
                    return false;
                }
                
                if (currX - prevX === 0 && currY - prevY > 0) {
                    if (firstMove) {
                        if (Math.round(currY - prevY) === Math.round(cellSize)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        } else if (Math.round(currY - prevY) === Math.round(cellSize * 2)) {
                            if (!this.tileIsOccupied(column, row, boardState) && !this.tileIsOccupied(column, row - 1, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        }
                    } else {
                        if (lastPosition && currY > lastPosition.y && Math.round(currY - lastPosition.y) === Math.round(cellSize)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
                                this.lastPositions.set(pieceId, { x: currX, y: currY });
                                return true;
                            }
                        } else {
                            return false;
                        }
                    }
                }
            }
        }
        /** ----------------------------------------------------------------------------- **/
    }
}