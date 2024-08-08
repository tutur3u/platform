export function ExampleButton({ label, color = 'green', onClick }: { label: string; color?: 'green' | 'purple' | 'red'; onClick?: () => void }) {
  return (
    <button 
    onClick={onClick}
    className={`${color === 'green' ? 'bg-green-300/20 hover:bg-green-300/30 border-green-300/50 text-green-300' : color === 'purple' ? 'bg-purple-300/20 hover:bg-purple-300/30 border-purple-300/50 text-purple-300' : 'bg-red-300/20 hover:bg-red-300/30 border-red-300/50 text-red-300'} w-full border transition duration-300 rounded-lg p-2`}>
        {label}
    </button>
  )
}
