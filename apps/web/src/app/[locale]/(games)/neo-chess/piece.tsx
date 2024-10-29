'use client';

import { PieceType, TeamType } from './pieceSetup';

interface Piece {
  id: string;
  image: string;
  type: PieceType;
  team: TeamType;
  firstMove: boolean;
}

export default function Tile({ id, image }: Piece) {
  return (
    <img
      id={id}
      className="hover:cursor-grab active:cursor-grabbing"
      style={{ backgroundImage: `url(${image})` }}
      src={image}
    />
  );
}
