import { PieceType, TeamType, Piece, removePieceById, pieces } from "./pieceSetup";

export default class Referee {
    private lastPositions: Map<string, { x: number, y: number, column: number, row: number }> = new Map();

    tileIsOccupied(x: number, y: number, boardState: Piece[]): boolean {
        return boardState.some(piece => piece.x === x && piece.y === y);
    }

    tileIsOccupiedByOpponent(x: number, y: number, team: TeamType, boardState: Piece[]): boolean {
        const piece = boardState.find(p => p.x === x && p.y === y);
        return piece !== undefined && piece.team !== team;
    }

    private isPathClear(verticalDistance: number, horizontalDistance: number, cellSize: number, boardState: Piece[], row: number, column: number): boolean {
        const rowDirection = verticalDistance === 0 ? 0 : (verticalDistance > 0 ? 1 : -1);
        const colDirection = horizontalDistance === 0 ? 0 : (horizontalDistance > 0 ? 1 : -1);
        const steps = verticalDistance !== 0 ? (Math.abs(verticalDistance)/ Math.round(cellSize)) : (Math.abs(horizontalDistance)/ Math.round(cellSize));

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
        const horizontalDistance = Math.round(currX - startX);

        const isDiagonalMove = Math.abs(horizontalDistance) === Math.abs(verticalDistance);
        // const isStraightMove = horizontalDistance === 0 || verticalDistance === 0;

        const removeCapturedPiece = (x: number, y: number) => {
            const piece = boardState.find(p => p.x === x && p.y === y);
            if (piece) {
                removePieceById(piece.id, team);
                console.log("Piece removed: ", piece.id);
            }
        };

        if (type === PieceType.PAWN) {
            const pawnDirection = isOurTeam ? -1 : 1;

            // MOVEMENT LOGIC
            if (Math.abs(horizontalDistance) === 0 && verticalDistance * pawnDirection > 0) {
                const intermediateRow = row - pawnDirection;
                if (!this.tileIsOccupied(column, row, boardState) &&
                    (
                        (Math.abs(verticalDistance) === Math.round(cellSize) * 2 && firstMove && !this.tileIsOccupied(column, intermediateRow, boardState) && !this.tileIsOccupied(column, row, boardState))
                        || Math.abs(verticalDistance) === Math.round(cellSize)
                    )
                ) {
                    this.lastPositions.set(pieceId, { x: currX, y: currY, column, row });
                    console.log("Valid move: ", pieces.find(p => p.id === pieceId));
                    return true;
                }
            }

            // ATTACK LOGIC
            else if (isDiagonalMove && Math.abs(verticalDistance) === Math.round(cellSize) && verticalDistance * pawnDirection > 0 && this.tileIsOccupiedByOpponent(column, row, team, boardState)) {
                removeCapturedPiece(column, row);
                this.lastPositions.set(pieceId, { x: currX, y: currY, column, row });
                console.log("Valid capture: ", pieces.find(p => p.id === pieceId));
                return true;
            }
        }
        else if (type === PieceType.KING) {

            if (Math.abs(verticalDistance) <= Math.round(cellSize) && Math.abs(horizontalDistance) <= Math.round(cellSize)) {
                if (!this.tileIsOccupied(column, row, boardState)                   // MOVEMENT LOGIC
                    || this.tileIsOccupiedByOpponent(column, row, team, boardState) // ATTACK LOGIC
                ) {
                    if (this.tileIsOccupiedByOpponent(column, row, team, boardState)) {
                        removeCapturedPiece(column, row);
                    }
                    this.lastPositions.set(pieceId, { x: currX, y: currY, column, row });
                    return true;
                }
            }
        }
        else if (type === PieceType.BISHOP) {
            
            if (isDiagonalMove && this.isPathClear(verticalDistance, horizontalDistance, cellSize, boardState, row, column) &&
                (!this.tileIsOccupied(column, row, boardState)                   // MOVEMENT LOGIC
                || this.tileIsOccupiedByOpponent(column, row, team, boardState)) // ATTACK LOGIC
            ) {
                if (this.tileIsOccupiedByOpponent(column, row, team, boardState)) {
                    removeCapturedPiece(column, row);
                }
                this.lastPositions.set(pieceId, { x: currX, y: currY, column, row });
                return true;
            }
        }
        else if (type === PieceType.QUEEN) {
            
            if (this.isPathClear(verticalDistance, horizontalDistance, cellSize, boardState, row, column) &&
                (!this.tileIsOccupied(column, row, boardState)                   // MOVEMENT LOGIC
                || this.tileIsOccupiedByOpponent(column, row, team, boardState)) // ATTACK LOGIC
            ) {
                if (this.tileIsOccupiedByOpponent(column, row, team, boardState)) {
                    removeCapturedPiece(column, row);
                }
                this.lastPositions.set(pieceId, { x: currX, y: currY, column, row });
                return true;
            }
        }

        return false;
    }
}