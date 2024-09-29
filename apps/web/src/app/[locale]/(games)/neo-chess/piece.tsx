"use client";

import React from 'react';
import { PieceType, TeamType } from './pieceSetup';


interface Piece {
  id: string;
  image: string;
  number: number;
  type: PieceType;
  team: TeamType;
  firstMove: boolean;
}

export default function Tile({id, image, number, type, team, firstMove}: Piece) {
  return (
    <img id={id} className="hover:cursor-grab active:cursor-grabbing" style={{backgroundImage: `url(${image})`}} src={image}/>
  );
}