import { ReactNode } from "react";

export default function GlitchText({ children }: { children: ReactNode }) {
  return (
    <span
      className="relative inline-block text-primary"
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