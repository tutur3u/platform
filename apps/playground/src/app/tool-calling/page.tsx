'use client';

import { useEffect, useState } from 'react';

function ToolCallingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [toolCallingData, setToolCallingData] = useState<{
    text: string;
    steps: string[];
  } | null>(null);

  useEffect(() => {
    const fetchToolCallingData = async () => {
      const response = await fetch('/api/ai/tool-calling');
      const data = await response.json();
      setToolCallingData(data);
      setIsLoading(false);
    };
    fetchToolCallingData();
  }, []);

  return (
    <div>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div>
          <pre className="mb-4 rounded border p-2 whitespace-pre-wrap">
            {toolCallingData?.text}
          </pre>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(toolCallingData?.steps, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ToolCallingPage;
