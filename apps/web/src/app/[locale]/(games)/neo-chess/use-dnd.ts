// Handle Drag and Drop
"use client";

import React, { useRef } from 'react';
import Referee from './referee';
import { PieceType, TeamType, pieces } from './pieceSetup';
import ChessBoard from './chessboard';


export function useDragAndDrop(removePieceById: (id: string) => void) {
    const chessboardRef = useRef<HTMLDivElement>(null);
    let activePiece: HTMLElement | null = null;
    let hasMoved = useRef(false);
    const referee = new Referee();

    const touchStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const fixPosition = useRef<Record<string, { column: number, row: number, x: number, y: number, firstMove: boolean }>>({});
    const lastValidPosition = useRef<Record<string, { x: number; y: number }>>({});
    const cellCenter = useRef<{ nextColumn?: number; nextRow?: number; nextX?: number; nextY?: number; }>({});


    function grabPiece(e: React.MouseEvent) {
        e.preventDefault();
        if (e.target instanceof HTMLImageElement) {
            activePiece = e.target;
            touchStartPosition.current = { x: e.clientX, y: e.clientY };
            activePiece.style.position = 'absolute';
            activePiece.style.zIndex = '1';
            hasMoved.current = false;

            /** THIS BLOCK OF CODE STORES THE INITIAL POSITION OF THE PIECE **/
            const chessboard = chessboardRef.current;
            if (chessboard) {
                // Get the chessboard's bounding box and size of 1 cell
                const chessboardRect = chessboard.getBoundingClientRect();
                const cellSize = chessboardRect.width / 10;

                // Determine the column and row of the cell where the piece is grabbed
                const column = Math.round((activePiece.getBoundingClientRect().left - chessboardRect.left) / cellSize);
                const row = Math.round((activePiece.getBoundingClientRect().top - chessboardRect.top) / cellSize);

                // Calculate the center position of the cell
                const initCellCenterX = chessboardRect.left + (column * cellSize) + (cellSize / 2);
                const initCellCenterY = chessboardRect.top + (row * cellSize) + (cellSize / 2);

                // Store the position
                if (!fixPosition.current[activePiece.id]) {
                    fixPosition.current[activePiece.id] = {
                        column, row,
                        x: initCellCenterX,
                        y: initCellCenterY,
                        firstMove: true
                    };
                }
            }
            /** ----------------------------------------------------------- **/

            console.log('grabbing');
        }
    }

    function movePiece(e: React.MouseEvent) {
        const chessboard = chessboardRef.current;
        if (activePiece && chessboard) {    
            // Get the chessboard's bounding box and size of 1 cell
            const chessboardRect = chessboard.getBoundingClientRect();
            const cellSize = chessboardRect.width / 10;
    
            /** THIS BLOCK OF CODE MAKES THE PIECE FOLLOW THE MOUSE WHEN GRABBED **/
                // Calculate the current position of the active piece
                let currentLeftPosition = activePiece.getBoundingClientRect().left;
                let currentTopPosition = activePiece.getBoundingClientRect().top;

                // Calculate the deviation
                const diffX = e.clientX - touchStartPosition.current.x;
                const diffY = e.clientY - touchStartPosition.current.y;
        
                // Set the new position of the piece
                let newLeft = activePiece.offsetLeft + diffX;
                let newTop = activePiece.offsetTop + diffY;
        
                // Ensure not exceed the board
                if (currentLeftPosition - cellSize < chessboardRect.left) {
                    newLeft = chessboardRect.left - currentLeftPosition + cellSize + newLeft;
                } else if (currentLeftPosition + 2*cellSize > chessboardRect.right) {
                    newLeft =  newLeft - (currentLeftPosition + 2*cellSize - chessboardRect.right);
                }
        
                if (currentTopPosition - cellSize < chessboardRect.top) {
                    newTop = chessboardRect.top - currentTopPosition + cellSize + newTop;
                } else if (currentTopPosition + 2*cellSize > chessboardRect.bottom) {
                    newTop = newTop - (currentTopPosition + 2*cellSize - chessboardRect.bottom);
                }

                // Update position when following the mouse
                activePiece.style.left = `${newLeft}px`;
                activePiece.style.top = `${newTop}px`;
                touchStartPosition.current = { x: e.clientX, y: e.clientY };
            /** ---------------------------------------------------------------- **/

            /** THIS BLOCK OF CODE CHECKS WHICH COLUMN AND ROW THE PIECE BELONGS TO **/
                // Determine the column and row of the cell where the piece is grabbed
                const column = Math.round((activePiece.getBoundingClientRect().left - chessboardRect.left) / cellSize);
                const row = Math.round((activePiece.getBoundingClientRect().top - chessboardRect.top) / cellSize);

                // Calculate the center position of the cell
                const nextCellCenterX = chessboardRect.left + (column * cellSize) + (cellSize / 2);
                const nextCellCenterY = chessboardRect.top + (row * cellSize) + (cellSize / 2);

                // Store the cell center position
                cellCenter.current = {
                    nextColumn: column,
                    nextRow: row,
                    nextX: nextCellCenterX,
                    nextY: nextCellCenterY,
                };
            /** ------------------------------------------------------------------- **/

            hasMoved.current = true;
            console.log('moving');
        }
    }
    
    function dropPiece(_e: React.MouseEvent) {
        const chessboard = chessboardRef.current;

        /** THIS BLOCK OF CODE UPDATES THE ACTIVE PIECE TO THE CENTER OF THE CELL IF MOVED **/
        if (activePiece && chessboard && hasMoved.current) {
            const pieceId = activePiece.id;

            // Get the chessboard's bounding box and size of 1 cell
            const chessboardRect = chessboard.getBoundingClientRect();
            const cellSize = chessboardRect.width / 10;

            // Check Piece Type and Team
            const imageSrc = (activePiece as HTMLImageElement).src;
            const pieceMatch = imageSrc.match(/([bw])_(\w+)\.png$/);
            let pieceTeam: TeamType | null = null;
            let pieceType: PieceType | null = null;

            if (pieceMatch) {
                if (pieceMatch[1]) {
                    const pieceTeamString = pieceMatch[1] === "w" ? TeamType.OURS : TeamType.OPPONENT;
                    pieceTeam = TeamType[pieceTeamString as keyof typeof TeamType];
                }
                if (pieceMatch[2]) {
                    const pieceTypeString = pieceMatch[2].toUpperCase();
                    pieceType = PieceType[pieceTypeString as keyof typeof PieceType];
                }
            }

            if (fixPosition.current[pieceId]
                && cellCenter.current.nextX && cellCenter.current.nextY
                && cellCenter.current.nextColumn && cellCenter.current.nextRow
                && pieceType && pieceTeam
            ) {
                const validMove = referee.isValidMove(
                                    pieceId,
                                    cellCenter.current.nextColumn, cellCenter.current.nextRow,
                                    fixPosition.current[pieceId].x, fixPosition.current[pieceId].y,
                                    cellCenter.current.nextX, cellCenter.current.nextY,
                                    cellSize, pieceType, pieceTeam,
                                    fixPosition.current[pieceId].firstMove,
                                    pieces
                                );

                // Update the position of the piece to the center of the cell
                if (validMove) {
                    if (fixPosition.current[pieceId] && fixPosition.current[pieceId].x) {
                        activePiece.style.left = `${cellCenter.current.nextX! - fixPosition.current[pieceId].x}px`;
                    }
                
                    if (fixPosition.current[pieceId] && fixPosition.current[pieceId].y) {
                        activePiece.style.top = `${cellCenter.current.nextY! - fixPosition.current[pieceId].y}px`;
                    }

                    // Update the pieces array with the new position
                    const pieceIndex = pieces.findIndex(piece => piece.id === pieceId);
                    if (pieces[pieceIndex]) {
                        pieces[pieceIndex].x = cellCenter.current.nextColumn;
                        pieces[pieceIndex].y = cellCenter.current.nextRow;
                    }

                    // Check if a piece is captured
                    const capturedPiece = pieces.find(piece => 
                        piece.x === cellCenter.current.nextColumn && 
                        piece.y === cellCenter.current.nextRow && 
                        piece.id !== pieceId
                    );
                    if (capturedPiece) {
                        removePieceById(capturedPiece.id);
                    }

                    fixPosition.current[pieceId].firstMove = false;
                } else {
                    // Not move the piece if the move is invalid
                    if (lastValidPosition.current[pieceId]) {
                        activePiece.style.left = `${lastValidPosition.current[pieceId].x}px`;
                        activePiece.style.top = `${lastValidPosition.current[pieceId].y}px`;
                    } else {
                        activePiece.style.left = `${0}px`;
                        activePiece.style.top = `${0}px`;
                    }
                }


                // Store the last valid position when the piece is grabbed
                lastValidPosition.current[pieceId] = {
                    x: parseFloat(activePiece.style.left),
                    y: parseFloat(activePiece.style.top),
                };
            }
        }
        /** ------------------------------------------------------------------------------ **/
              
        // Reset cellCenter after drop
        cellCenter.current = {
            nextX: undefined,
            nextY: undefined
        };

        activePiece = null;
        console.log('dropping');
    }

    return { grabPiece, movePiece, dropPiece, chessboardRef };
}