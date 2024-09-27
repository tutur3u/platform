"use client";

import React from 'react';


interface Piece {
  id: string;
  image: string;
  number: number;
}

export default function Tile({image, number, id}: Piece) {
  return (
    <img id={id} className="hover:cursor-grab active:cursor-grabbing" style={{backgroundImage: `url(${image})`}} src={image}/>
  );
}