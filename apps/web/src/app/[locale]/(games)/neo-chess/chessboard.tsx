import React from 'react';

const horizontal: string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const vertical: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ChessBoard() {
    let board: React.ReactNode[] = [];
    
    for (let i = 0; i <= horizontal.length; i++) {
        const row: React.ReactNode[] = [];
        for (let j = 0; j <= vertical.length; j++) {
            if (i === 0) {
                if (j === 0) {
                    row.push(
                        <div className='square bg-inherit w-20 sm:w-16 aspect-square'></div>
                    )
                } else {
                    row.push(
                        <div className='square p-1 bg-inherit w-20 sm:w-16 aspect-square text-center flex items-end justify-center'>
                            {`${horizontal[j - 1]}`}
                        </div>
                    )
                }                
            } else {
                if (j === 0) {
                    row.push(
                        <div className='square p-1 bg-inherit w-20 sm:w-16 aspect-square text-right flex justify-center'>
                            {`${vertical[i - 1]}`}
                        </div>
                    )
                } else {
                    row.push(
                        (i%2!==0 && j%2!==0 || i%2===0 && j%2===0) ? (
                            <div className='square bg-white w-20 sm:w-16 aspect-square'>
                            </div>
                        ) : (
                            <div className='square bg-blue-200 w-20 sm:w-16 aspect-square'>
                            </div>
                        )
                    );
                }
            }
        }

        board.push(
            <div className='row flex w-full h-full'>
                {row}
            </div>
        );
    }

    return (
        <div className="m-auto w-9/12 h-4/5">
            {board}
        </div>
    );
}