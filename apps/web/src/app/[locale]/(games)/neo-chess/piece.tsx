import React from 'react';

interface Piece {
  image: string;
  number: number;
}

export default function Tile({image, number}: Piece) {
  return (
    <img className="hover:cursor-grab active:cursor-grabbing" style={{backgroundImage: `url(${image})`}} src={image}/>
  );
}