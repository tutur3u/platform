import React from 'react';

import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';

import Chessboard from './chessboard';

export default function NeoChess() {
  return (
    <div>
      <Chessboard/>
    </div>
  );
}