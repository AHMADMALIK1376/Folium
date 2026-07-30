import Image from "next/image";

import { cn } from "@/lib/utils";

/** The source image is 327x398 — taller than it is wide — so sizes are derived
 *  from the height to keep the aspect ratio exact rather than guessed. */
const RATIO = 327 / 398;

const SIZES = {
  sm: 28,
  md: 40,
  lg: 64,
} as const;

export function Logo({
  size = "md",
  withWordmark = true,
  className,
}: {
  size?: keyof typeof SIZES;
  withWordmark?: boolean;
  className?: string;
}) {
  const height = SIZES[size];
  const width = Math.round(height * RATIO);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/images/websitelogo.png"
        alt=""
        width={width}
        height={height}
        // Decorative when the wordmark is beside it: a screen reader would
        // otherwise announce "Folium" twice. Without the wordmark the image
        // carries the name, so it needs a real label.
        aria-hidden={withWordmark}
        priority
      />
      {withWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight text-neutral-900",
            size === "lg" ? "text-2xl" : "text-lg",
          )}
        >
          Folium
        </span>
      )}
      {!withWordmark && <span className="sr-only">Folium</span>}
    </span>
  );
}
