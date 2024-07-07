import { Fruit } from './types';

export const summonLineEraser = ({
  fruits,
  setFruits,
}: {
  fruits: (Fruit | undefined)[];
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>;
}) => {
  // Filter for normal fruits only
  const normalFruitsIndices = fruits
    .map((fruit, index) => ({ ...fruit, index }))
    .filter((fruit) => fruit.type === 'normal')
    .map((fruit) => fruit.index);

  // Proceed only if there are normal fruits
  if (normalFruitsIndices.length > 0) {
    const randomIndex =
      normalFruitsIndices[
        Math.floor(Math.random() * normalFruitsIndices.length)
      ]!;
    const newFruits = [...fruits];

    newFruits[randomIndex] = new Fruit(
      newFruits[randomIndex]!.color!.name,
      Math.random() < 0.5 ? 'horizontal' : 'vertical'
    );

    setFruits(newFruits);
  }
};

export const summonRainbowFruit = ({
  fruits,
  setFruits,
}: {
  fruits: (Fruit | undefined)[];
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>;
}) => {
  // Filter for normal fruits only
  const normalFruitsIndices = fruits
    .map((fruit, index) => ({ ...fruit, index }))
    .filter((fruit) => fruit.type === 'normal')
    .map((fruit) => fruit.index);

  // Proceed only if there are normal fruits
  if (normalFruitsIndices.length > 0) {
    const randomIndex =
      normalFruitsIndices[
        Math.floor(Math.random() * normalFruitsIndices.length)
      ]!;
    const newFruits = [...fruits];

    newFruits[randomIndex] = new Fruit(
      undefined,
      'rainbow'
    );

    setFruits(newFruits);
  }
};

export const summonExplosiveFruit = ({
  fruits,
  setFruits,
}: {
  fruits: (Fruit | undefined)[];
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>;
}) => {
  // Filter for normal fruits only
  const normalFruitsIndices = fruits
    .map((fruit, index) => ({ ...fruit, index }))
    .filter((fruit) => fruit.type === 'normal')
    .map((fruit) => fruit.index);

  // Proceed only if there are normal fruits
  if (normalFruitsIndices.length > 0) {
    const randomIndex =
      normalFruitsIndices[
        Math.floor(Math.random() * normalFruitsIndices.length)
      ]!;
    const newFruits = [...fruits];

    newFruits[randomIndex] = new Fruit(
      newFruits[randomIndex]!.color!.name,
      'explosive'
    );

    setFruits(newFruits);
  }
};
