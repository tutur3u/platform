import React from 'react';

interface Piece {
  image: string;
  number: number;
}

export default function Tile({number, image}: Piece) {
  if (number % 2 === 0) {
    return (
        <img src={image}/>
    );
  } else {
    return (
      <img src={image}/>
    );
  }
}
