import { ReactNode } from "react";

export default function GlitchText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`relative inline-block text-primary ${className ?? ""}`}
      style={{
        textShadow:
          "0 0 8px hsl(120 100% 45% / 0.7), 0 0 24px hsl(120 100% 45% / 0.4)",
      }}
      data-text={typeof children === "string" ? children : undefined}
    >
      {children}
    </span>
  );
}