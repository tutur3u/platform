interface ResultsProps {
  results: string[]
}

export function Results({ results }: ResultsProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Results</h2>
      {results.length === 0 ? (
        <p className="text-gray-500">Run tests to see results</p>
      ) : (
        <ul className="space-y-2">
          {results.map((result, index) => (
            <li key={index} className="bg-gray-100 p-2 rounded">
              {result}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

