'use client';

import { ExampleButton } from './button';
import { useState } from 'react';

export default function Page() {
  const [result, setResult] = useState(0);

  return (
    <div className="m-4 flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-blue-300 bg-blue-300/20 p-4 text-center font-semibold text-blue-300">
        <div>
          Current value: <span className="font-bold">{result}</span>
        </div>
      </div>

      <div className="m-4 grid max-w-sm grid-cols-3 gap-2 font-bold">
        <ExampleButton
          label="-1"
          color="red"
          onClick={() => setResult((oldResult) => oldResult - 1)}
        />
        <ExampleButton
          label="Reset to 0"
          color="purple"
          onClick={() => setResult(0)}
        />
        <ExampleButton
          label="+1"
          color="green"
          onClick={() => setResult((oldResult) => oldResult + 1)}
        />
      </div>
    </div>
  );
}
