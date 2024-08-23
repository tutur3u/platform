import React from 'react';

const horizontal = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const vertical = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ChessBoard() {
    let board: React.ReactNode[] = [];
    
    for (let i = 0; i <= horizontal.length + 1; i++) {
        const row: React.ReactNode[] = [];
        for (let j = 0; j <= vertical.length + 1; j++) {
            if (i === 0 || i === horizontal.length + 1) {
                if (j === 0 || j === vertical.length + 1) {
                    row.push(
                        <div key={null} className='relative flex h-8 aspect-square items-center justify-center md:h-9 md:w-9 lg:h-10 lg:w-10'></div>
                    )
                } else {
                    row.push(
                        <div key={j-1} className='relative flex h-8 aspect-square items-center justify-center md:h-9 md:w-9 lg:h-10 lg:w-10'>
                            {`${horizontal[j-1]}`}
                        </div>
                    )
                }                
            } else {
                if (j === 0 || j === vertical.length + 1) {
                    row.push(
                        <div key={i-1} className='relative flex h-8 aspect-square items-center justify-center md:h-9 md:w-9 lg:h-10 lg:w-10'>
                            {`${vertical[vertical.length - i]}`}
                        </div>
                    )
                } else {
                    row.push(
                        (i%2!==0 && j%2!==0 || i%2===0 && j%2===0) ? (
                            <div className='relative flex h-8 aspect-square items-center justify-center md:h-9 md:w-9 lg:h-10 lg:w-10'>
                                x
                            </div>
                        ) : (
                            <div className='relative bg-blue-200 flex h-8 aspect-square items-center justify-center md:h-9 md:w-9 lg:h-10 lg:w-10'>
                                y
                            </div>
                        )
                    );
                }
            }
        }

        board.push(
            <div className='mx-auto grid w-fit grid-cols-10'>
                {row}
            </div>
        );
    }

    return (
        <div className="m-auto left-[50%] top-[50%] grid w-full p-6 sm:rounded-lg max-w-sm md:max-w-4xl lg:max-w-6xl">
            <div className='grid grid-cols-1 md:grid-cols-2'>
                <div className='bg-card text-card-foreground rounded-lg border shadow-sm w-full p-2 md:p-4'>
                    <div className='relative'>
                        {board}
                    </div>
                </div>
            </div>
        </div>
    );
}