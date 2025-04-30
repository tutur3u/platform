interface ResultsProps {
  results: string[];
}

export function Results({ results }: ResultsProps) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">Results</h2>
      {results.length === 0 ? (
        <p className="text-gray-500">Run tests to see results</p>
      ) : (
        <ul className="space-y-2">
          {results.map((result, index) => (
            <li key={index} className="rounded bg-gray-100 p-2">
              {result}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
