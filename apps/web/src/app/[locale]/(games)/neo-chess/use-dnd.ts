// Handle Drag and Drop
"use client";

import React, { useRef } from 'react';


export function useDragAndDrop() {
    const chessboardRef = useRef<HTMLDivElement>(null);
    let activePiece: HTMLElement | null = null;
    let hasMoved = useRef(false);

    const touchStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const cellCenter = useRef<{ nextX?: number; nextY?: number; }>({});
    const fixPosition = useRef<Record<string, { x: number; y: number }>>({});


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
                        x: initCellCenterX,
                        y: initCellCenterY
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
                    nextX: nextCellCenterX,
                    nextY: nextCellCenterY,
                };
            /** ------------------------------------------------------------------- **/

            hasMoved.current = true;
            console.log('moving');
        }
    }
    
    function dropPiece(e: React.MouseEvent) {
        const chessboard = chessboardRef.current;
        /** THIS BLOCK OF CODE UPDATES THE ACTIVE PIECE TO THE CENTER OF THE CELL IF MOVED **/
        if (activePiece && chessboard && hasMoved.current) {
            const pieceId = activePiece.id;

            if (cellCenter.current.nextX !== undefined) {
                if (fixPosition.current[pieceId] && typeof fixPosition.current[pieceId].x === 'number') {
                    activePiece.style.left = `${cellCenter.current.nextX! - fixPosition.current[pieceId].x}px`;
                }
            }
            if (cellCenter.current.nextY !== undefined) {
                if (fixPosition.current[pieceId] && typeof fixPosition.current[pieceId].y === 'number') {
                    activePiece.style.top = `${cellCenter.current.nextY! - fixPosition.current[pieceId].y}px`;
                }
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