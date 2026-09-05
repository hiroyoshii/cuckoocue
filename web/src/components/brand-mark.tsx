import Image from "next/image";

export function BrandMark({ size = 40, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="brand-mark"
      height={size}
      priority={priority}
      src="/brand/mark.png"
      width={size}
    />
  );
}

export function BrandLockup({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      alt="Cuckoo Cue"
      className="brand-lockup-image"
      height={44}
      priority={priority}
      src="/brand/lockup-header.png"
      width={151}
    />
  );
}
