import { Card } from '@repo/ui/components/ui/card';
import React from 'react';

export default function TestCaseComponent() {
  return (
    <div className="pt-3">
      <Card className="min-h-[300px] overflow-y-auto p-4">
        <h2 className="mb-2 text-xl font-bold">Test Case</h2>
        <pre className="whitespace-pre-wrap rounded-md bg-gray-200 p-2">
          In the case of business world, we have to do this to test out the
          cases askjdnakjscnavkjn askjdn ak akjsnd jnasdknj acsjknakjnvqjnf jas
          kdn
        </pre>
      </Card>
    </div>
  );
}
