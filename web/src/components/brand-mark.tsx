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
      className="brand-abstract-lockup"
      height={60}
      priority={priority}
      src="/brand/lockup-abstract.png"
      width={180}
    />
  );
}

export function BrandHero({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="brand-hero"
      height={941}
      priority={priority}
      src="/brand/hero.png"
      width={1672}
    />
  );
}
