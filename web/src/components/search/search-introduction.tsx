import { getImageProps } from "next/image";

const common = {
  alt: "猫と一緒に引っ越す、と検索。猫との引っ越し準備の棚から、猫を連れていく準備のリストを選び、スマホのホーム画面でタスクをチェックする使い方の例。",
  sizes: "(max-width: 680px) min(360px, calc(100vw - 36px)), (max-width: 900px) calc(100vw - 240px), (max-width: 1172px) calc(100vw - 332px), 840px",
  loading: "eager" as const,
};

const { props: desktop } = getImageProps({
  ...common,
  src: "/brand/search-shelf-introduction.png",
  width: 1536,
  height: 1024,
});
export function SearchIntroduction() {
  return (
    <figure className="search-introduction">
      <picture>
        {/* getImageProps supplies Next.js optimization for this responsive illustration. */}
        <img {...desktop} alt={common.alt} />
      </picture>
    </figure>
  );
}
