export type TimeUnit = {
  label: 'Days' | 'Hours' | 'Minutes' | 'Seconds';
  value: string;
};

export function getTimeLeft(from: Date, to: Date): TimeUnit[] {
  const remainingTime = Math.max(0, to.getTime() - from.getTime());
  const totalSeconds = Math.floor(remainingTime / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    { label: 'Days', value: String(days).padStart(2, '0') },
    { label: 'Hours', value: String(hours).padStart(2, '0') },
    { label: 'Minutes', value: String(minutes).padStart(2, '0') },
    { label: 'Seconds', value: String(seconds).padStart(2, '0') },
  ];
}
