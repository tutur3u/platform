'use client'

import { useState } from "react";
import { ExampleButton } from "./button";

export default function Page() {
  const [result, setResult] = useState(0);

  return (
    <div className="flex flex-col items-center justify-center w-full m-4">
        <div className="w-full max-w-sm p-4 text-center rounded-lg font-semibold bg-blue-300/20 text-blue-300 border border-blue-300">
            <div>Current value: <span className="font-bold">{result}</span></div>
        </div>

        <div className="m-4 font-bold grid grid-cols-3 gap-2 max-w-sm">
            <ExampleButton label="-1" color="red" onClick={() => setResult((oldResult) => oldResult - 1)} />
            <ExampleButton label="Reset to 0" color="purple" onClick={() => setResult(0)} />
            <ExampleButton label="+1" color="green" onClick={() => setResult((oldResult) => oldResult + 1)} />
        </div>
    </div>
  )
}
