'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Node {
  id: number;
  x: number;
  y: number;
}

export function NetworkEffect() {
  const [nodes, setNodes] = useState<Node[]>([]);

  useEffect(() => {
    // Generate nodes only on the client to avoid hydration mismatches
    // and "random()" errors during pre-rendering
    setNodes(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
      }))
    );
  }, []);

  if (nodes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 opacity-30">
      <svg className="h-full w-full" aria-hidden="true">
        {/* Connections */}
        {nodes.map((node, i) =>
          nodes.slice(i + 1).map((other, _j) => {
            const dist = Math.hypot(node.x - other.x, node.y - other.y);
            // Connect close nodes (percentage based distance)
            if (dist < 20) {
              return (
                <motion.line
                  key={`${node.id}-${other.id}`}
                  x1={`${node.x}%`}
                  y1={`${node.y}%`}
                  x2={`${other.x}%`}
                  y2={`${other.y}%`}
                  stroke="rgba(251, 191, 36, 0.2)" // pack-amber with low opacity
                  strokeWidth="1"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 2, delay: Math.random() * 2 }}
                />
              );
            }
            return null;
          })
        )}

        {/* Nodes */}
        {nodes.map((node) => (
          <motion.circle
            key={node.id}
            cx={`${node.x}%`}
            cy={`${node.y}%`}
            r="2"
            fill="#fbbf24" // pack-amber
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 1, delay: Math.random() * 2 }}
          />
        ))}
      </svg>
    </div>
  );
}
