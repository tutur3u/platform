import type { Position } from './position';

export class Player {
  private position: Position;

  constructor(position: Position) {
    this.position = position;
  }

  getPosition() {
    return this.position;
  }

  move(direction: 'up' | 'down' | 'left' | 'right') {
    switch (direction) {
      case 'up':
        this.position.setY(this.position.getY() - 1);
        break;
      case 'down':
        this.position.setY(this.position.getY() + 1);
        break;
      case 'left':
        this.position.setX(this.position.getX() - 1);
        break;
      case 'right':
        this.position.setX(this.position.getX() + 1);
        break;
    }
  }
}
