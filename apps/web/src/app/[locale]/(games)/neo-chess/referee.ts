import { PieceType, TeamType } from "./pieceSetup";

export default class Referee {
    private lastPositions: Map<string, { x: number, y: number }> = new Map();

    isValidMove(
        pieceId: string,
        prevX: number, prevY: number,
        currX: number, currY: number,
        cellSize: number,
        type: PieceType, team: TeamType, firstMove: boolean
    ) {
        /*
        *  Get the last position of the piece
        *  If it is the first move, there should be no last position
        *  If it is not the first move, there should be a last
        *  When rebuilding but not refreshing the page, the lastPosition is reset to undefined
        */
        const lastPosition = this.lastPositions.get(pieceId);

        /** CONSUMING OUR TEAM IS WHITE, ONLY ABLE TO MOVE THE WHITE PIECES AT THE MOMENT **/
        if (team === TeamType.OURS) {
            if (type === PieceType.PAWN) {
                if (!lastPosition && !firstMove) {
                    console.log("Error: No last position for non-first move");
                    return false;
                }
                
                if (currX - prevX === 0 && currY - prevY < 0) {
                    if (firstMove) {
                        if (Math.round(currY - prevY) === - Math.round(cellSize)
                            || Math.round(currY - prevY) === - Math.round(cellSize * 2)
                        ) {
                            console.log('Valid Pawn first move');
                            this.lastPositions.set(pieceId, { x: currX, y: currY });
                            return true;
                        } else {
                            console.log('Invalid Pawn first move');
                            return false;
                        }
                    } else {
                        if (lastPosition && currY < lastPosition.y
                            && Math.round(currY - lastPosition.y) === - Math.round(cellSize)
                        ) {
                            console.log('Valid Pawn move');
                            this.lastPositions.set(pieceId, { x: currX, y: currY });
                            return true;
                        } else {
                            console.log('Invalid Pawn move');
                            return false;
                        }
                    }
                }
            }
        }
        /** ----------------------------------------------------------------------------- **/
    }
}