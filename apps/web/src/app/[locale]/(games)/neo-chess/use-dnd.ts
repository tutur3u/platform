// Handle Drag and Drop

import React, { useRef, useEffect } from 'react';


export function useDragAndDrop() {
    const chessboardRef = useRef<HTMLDivElement>(null);
    let activePiece: HTMLElement | null = null;
    const touchStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    function grabPiece(e: React.MouseEvent) {
        e.preventDefault();
        if (e.target instanceof HTMLImageElement) {
            activePiece = e.target;
            touchStartPosition.current = { x: e.clientX, y: e.clientY };
            activePiece.style.position = 'absolute';
            activePiece.style.zIndex = '1';

            console.log('grabbing');
        }
    }

    function movePiece(e: React.MouseEvent) {
        const chessboard = chessboardRef.current;
    
        if (activePiece && chessboard) {    
            // Get the chessboard's bounding box and size of 1 cell
            const chessboardLeft = chessboard.getBoundingClientRect().left;
            const chessboardRight = chessboard.getBoundingClientRect().right;
            const chessboardTop = chessboard.getBoundingClientRect().top;
            const chessboardBottom = chessboard.getBoundingClientRect().bottom;
            let cellSize = (chessboardRight - chessboardLeft) / 10;
    
            // Calculate the current position of the active piece
            let currentLeftPosition = activePiece.getBoundingClientRect().left;
            console.log("Current position", currentLeftPosition);
            let currentTopPosition = activePiece.getBoundingClientRect().top;

            // Calculate the deviation
            const diffX = e.clientX - touchStartPosition.current.x;
            const diffY = e.clientY - touchStartPosition.current.y;
    
            // Set the new position of the piece
            let newLeft = activePiece.offsetLeft + diffX;
            let newTop = activePiece.offsetTop + diffY;
    
            // Ensure not exceed the board
            if (currentLeftPosition - cellSize < chessboardLeft) {
                newLeft = chessboardLeft - currentLeftPosition + cellSize + newLeft;
            } else if (currentLeftPosition + 2*cellSize > chessboardRight) {
                newLeft =  newLeft - (currentLeftPosition + 2*cellSize - chessboardRight);
            }
    
            if (currentTopPosition - cellSize < chessboardTop) {
                newTop = chessboardTop - currentTopPosition + cellSize + newTop;
            } else if (currentTopPosition + 2*cellSize > chessboardBottom) {
                newTop = newTop - (currentTopPosition + 2*cellSize - chessboardBottom);
            }

            // Update touch start position for next movement
            activePiece.style.left = `${newLeft}px`;
            activePiece.style.top = `${newTop}px`;
            touchStartPosition.current = { x: e.clientX, y: e.clientY };
    
            console.log('moving');
        }
    }
    
    

    function dropPiece(e: React.MouseEvent) {
        activePiece = null;
        console.log('dropping');
    }

    useEffect(() => {
        const handleResize = () => {
            console.log('Window resized');
        };
        window.addEventListener('resize', handleResize);

        // Cleanup listener on component unmount
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return { grabPiece, movePiece, dropPiece, chessboardRef };
}