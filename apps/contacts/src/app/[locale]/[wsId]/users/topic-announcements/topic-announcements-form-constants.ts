export const NO_GROUP = '__none__';
export const NO_TEMPLATE = '__none__';

export const TIME_INTERVALS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
});
