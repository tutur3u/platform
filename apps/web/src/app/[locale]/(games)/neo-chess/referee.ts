import { PieceType, TeamType, Piece } from "./pieceSetup";

export default class Referee {
    private lastPositions: Map<string, { x: number, y: number }> = new Map();
    
    tileIsOccupied(x: number, y: number, boardState: Piece[]): boolean {
        const piece = boardState.find(piece => piece.x === x && piece.y === y);
        if (piece) {
            console.log("Tile is occupied by: ", piece);
            return true;
        } else {
            console.log("Tile is not occupied");
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
        // console.log("Last position: ", lastPosition);
        // console.log("Current position: ", { x: currX, y: currY });
        // console.log("Fixed position: ", { x: prevX, y: prevY });
        // console.log("Piece type", type);

        /** CONSUMING OUR TEAM IS WHITE **/
        if (team === TeamType.OURS) {
            if (type === PieceType.PAWN) {
                if (!lastPosition && !firstMove) {
                    console.log("Error: No last position for non-first move");
                    return false;
                }
                
                if (currX - prevX === 0 && currY - prevY < 0) {
                    if (firstMove) {
                        if (Math.round(currY - prevY) === - Math.round(cellSize) || Math.round(currY - prevY) === - Math.round(cellSize * 2)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
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
                        if (Math.round(currY - prevY) === Math.round(cellSize) || Math.round(currY - prevY) === Math.round(cellSize * 2)) {
                            if (!this.tileIsOccupied(column, row, boardState)) {
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