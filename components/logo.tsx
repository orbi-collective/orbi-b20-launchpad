import Image from "next/image";

export function Logo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
      priority
      unoptimized
    />
  );
}
