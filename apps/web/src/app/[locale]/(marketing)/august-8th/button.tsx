export function ExampleButton({
  label,
  color = 'green',
  onClick,
}: {
  label: string;
  color?: 'green' | 'purple' | 'red';
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`${color === 'green' ? 'border-green-300/50 bg-green-300/20 text-green-300 hover:bg-green-300/30' : color === 'purple' ? 'border-purple-300/50 bg-purple-300/20 text-purple-300 hover:bg-purple-300/30' : 'border-red-300/50 bg-red-300/20 text-red-300 hover:bg-red-300/30'} w-full rounded-lg border p-2 transition duration-300`}
    >
      {label}
    </button>
  );
}
