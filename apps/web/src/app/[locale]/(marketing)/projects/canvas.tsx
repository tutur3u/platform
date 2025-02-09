'use client';

import { useEffect, useRef } from 'react';

export default function Canvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawCircle = (
      x: number,
      y: number,
      radius: number,
      color: string,
      blur: boolean = false
    ) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      if (blur) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'white';
      }
      ctx.arc(x, y, radius, 0, Math.PI * 2, false);
      ctx.fill();
      ctx.closePath();
    };

    const drawChevron = (x: number, y: number, size: number, angle: number) => {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 3;
      ctx.moveTo(x, y);
      ctx.lineTo(
        x - size * Math.sin(angle / 2),
        y + size * Math.cos(angle / 2)
      );
      ctx.lineTo(x, y);
      ctx.lineTo(
        x + size * Math.sin(angle / 2),
        y + size * Math.cos(angle / 2)
      );
      ctx.stroke();
      ctx.closePath();
    };

    // Draw the first circle
    drawCircle(
      canvas.width * 0.45,
      canvas.height * 0.5,
      canvas.width * 0.4,
      '#1AF4E6',
      true
    );

    // Draw the second circle
    drawCircle(
      canvas.width * 0.55,
      canvas.height * 0.5,
      canvas.width * 0.4,
      '#F4B71A',
      true
    );

    // Draw the third circle
    drawCircle(
      canvas.width * 0.5,
      canvas.height * 0.45,
      canvas.width * 0.4,
      'black',
      false
    );

    for (let i = 0; i < 5; i++) {
      drawChevron(
        canvas.width * 0.5,
        canvas.height * 0.45 + i * 40,
        canvas.width * 0.4 - i * 40,
        Math.PI / 2
      );
    }
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
