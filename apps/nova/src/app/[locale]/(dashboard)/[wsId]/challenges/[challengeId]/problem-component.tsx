import { Card, CardContent } from '@repo/ui/components/ui/card';
import React from 'react';

export default function ProblemComponent() {
  return (
    <div>
      <Card className="h-[500px] overflow-y-auto p-4 pt-10">
        <h2 className="text-xl font-bold">Title</h2>
        <p className="mt-2">Description: The problem statement</p>
        <h3 className="mt-3 font-semibold">Example:</h3>
        <pre className="rounded-md bg-gray-200 p-2">
          {`Input: s = "hello"\nOutput: "holle"`}
        </pre>
        <h3 className="mt-3 font-semibold">Constraints:</h3>
        <ul className="ml-5 list-disc">
          <li>1 ≤ s.length ≤ 3 * 10⁵</li>
          <li>1 ≤ s.length ≤ 3 * 10⁵</li>
          <li>s consists of printable ASCII characters.</li>
          <li>1 ≤ s.length ≤ 3 * 10⁵</li>
          <li>s consists of printable ASCII characters.</li>
          <li>1 ≤ s.length ≤ 3 * 10⁵</li>
          <li>s consists of printable ASCII characters.</li>
          <li>1 ≤ s.length ≤ 3 * 10⁵</li>
          <li>s consists of printable ASCII characters.</li>
          <li>1 ≤ s.length ≤ 3 * 10⁵</li>
          <li>s consists of printable ASCII characters.</li>
          <li>s consists of printable ASCII characters.</li>
        </ul>
      </Card>
    </div>
  );
}
