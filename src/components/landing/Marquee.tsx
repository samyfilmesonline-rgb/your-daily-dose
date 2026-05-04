import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function Marquee({
  children,
  className,
  pauseOnHover = true,
}: {
  children: ReactNode;
  className?: string;
  pauseOnHover?: boolean;
}) {
  return (
    <div className={cn("group flex overflow-hidden gap-6", className)}>
      <div
        className={cn(
          "flex shrink-0 items-stretch gap-6 animate-[marquee_35s_linear_infinite]",
          pauseOnHover && "group-hover:[animation-play-state:paused]"
        )}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "flex shrink-0 items-stretch gap-6 animate-[marquee_35s_linear_infinite]",
          pauseOnHover && "group-hover:[animation-play-state:paused]"
        )}
      >
        {children}
      </div>
    </div>
  );
}