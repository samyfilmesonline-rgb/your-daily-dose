import { useEffect, useRef } from "react";

/**
 * Canvas Matrix Rain — leve, com throttle de FPS.
 * Cor controlada via CSS variable --matrix-rain (HSL).
 */
export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const fontSize = 16;
    let columns = Math.floor(width / fontSize);
    let drops: number[] = Array(columns).fill(1);

    const chars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF$#@%&".split("");

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      columns = Math.floor(width / fontSize);
      drops = Array(columns).fill(1);
    };
    window.addEventListener("resize", handleResize);

    let last = 0;
    const interval = 60; // ms ~ 16fps, suficiente e leve
    let raf = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;

      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "hsl(120, 100%, 45%)";
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none opacity-40"
      aria-hidden
    />
  );
}