import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal-page.module.css";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className={styles.main}>
    <Link className={styles.back} href="/">← Cuckoo Cueへ戻る</Link>
    <article>
      <h1>{title}</h1>
      <p className={styles.updated}>最終更新日: 2026年9月27日</p>
      {children}
    </article>
    <nav aria-label="法務・サポート">
      <Link href="/privacy">プライバシー</Link><Link href="/terms">利用規約</Link><Link href="/support">サポート</Link>
    </nav>
  </main>;
}
