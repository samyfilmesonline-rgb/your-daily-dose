import { ReactNode } from "react";

export default function GlitchText({ children, className }: { children: ReactNode; className?: string }) {
  const text = typeof children === "string" ? children : undefined;
  return (
    <span
      className={`glitch-text relative inline-block text-primary ${className ?? ""}`}
      style={{
        textShadow:
          "0 0 8px hsl(120 100% 45% / 0.7), 0 0 24px hsl(120 100% 45% / 0.4)",
      }}
      data-text={text}
    >
      {text ? (
        <>
          <span aria-hidden className="glitch-layer glitch-layer--cyan">{text}</span>
          <span aria-hidden className="glitch-layer glitch-layer--magenta">{text}</span>
          <span className="relative">{text}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}