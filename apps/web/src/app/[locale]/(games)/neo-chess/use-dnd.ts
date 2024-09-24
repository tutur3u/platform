// Handle Drag and Drop

import React, { useRef } from 'react';

export function useDragAndDrop() {
    let activePiece: HTMLElement | null = null;
    const touchStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    function grabPiece(e: React.MouseEvent) {
        e.preventDefault();
        if (e.target instanceof HTMLImageElement) {
            activePiece = e.target;
            touchStartPosition.current = { x: e.clientX, y: e.clientY };
            activePiece.style.position = 'absolute';
            activePiece.style.zIndex = '1';
        }
    }

    function movePiece(e: React.MouseEvent) {
        if (activePiece) {
            const diffX = e.clientX - touchStartPosition.current.x;
            const diffY = e.clientY - touchStartPosition.current.y;
            activePiece.style.left = `${activePiece.offsetLeft + diffX}px`;
            activePiece.style.top = `${activePiece.offsetTop + diffY}px`;
            touchStartPosition.current = { x: e.clientX, y: e.clientY };
        }
    }

    function dropPiece(e: React.MouseEvent) {
        activePiece = null;
    }

    return { grabPiece, movePiece, dropPiece };
}
