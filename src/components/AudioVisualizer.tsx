"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  getFrequencyData: () => Uint8Array | undefined;
  isActive: boolean;
  color?: string;
  barCount?: number;
}

export function AudioVisualizer({
  getFrequencyData,
  isActive,
  color = "#6366f1",
  barCount = 32,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        // Draw idle state - flat line
        ctx.fillStyle = `${color}33`;
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const x = i * barWidth;
          const barHeight = 2;
          ctx.fillRect(
            x + 1,
            height / 2 - barHeight / 2,
            barWidth - 2,
            barHeight
          );
        }
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const frequencyData = getFrequencyData();
      const barWidth = width / barCount;

      for (let i = 0; i < barCount; i++) {
        let value: number;

        if (frequencyData && frequencyData.length > 0) {
          // Map bar index to frequency data index
          const dataIndex = Math.floor(
            (i / barCount) * frequencyData.length
          );
          value = frequencyData[dataIndex] / 255;
        } else {
          // Gentle idle animation
          value =
            0.05 +
            Math.sin(Date.now() / 500 + i * 0.3) * 0.03;
        }

        const barHeight = Math.max(2, value * height * 0.8);
        const x = i * barWidth;
        const y = height / 2 - barHeight / 2;

        // Gradient effect
        const alpha = 0.4 + value * 0.6;
        ctx.fillStyle =
          color +
          Math.round(alpha * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.beginPath();
        ctx.roundRect(x + 1, y, barWidth - 2, barHeight, 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getFrequencyData, color, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={64}
      className="w-full h-16"
    />
  );
}
