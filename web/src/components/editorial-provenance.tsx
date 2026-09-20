import { BadgeCheck, ExternalLink } from "lucide-react";
import type { EditorialProvenance } from "@/lib/shelves";

const sourceTypeLabels: Record<EditorialProvenance["sources"][number]["source_type"], string> = {
  official: "公式情報",
  youtube: "YouTube",
  blog: "ブログ",
  interview: "取材",
};

export function EditorialProvenanceNote({ provenance }: { provenance?: EditorialProvenance | null }) {
  if (!provenance) return null;
  return <details className="editorial-provenance">
    <summary>
      <BadgeCheck size={16} aria-hidden="true" />
      <span>{provenance.curator_label}</span>
      <small>{provenance.sources.length}件の公開情報を参照</small>
    </summary>
    <div className="editorial-provenance-body">
      <p>複数の公開情報から生活条件と手順を抽出し、CuckooCue独自の表現で構成しています。原文の転載ではありません。</p>
      <p className="editorial-review-date">{provenance.reviewed_at.slice(0, 10)} 確認</p>
      <ul>
        {provenance.sources.map((source) => <li key={source.url}>
          <a href={source.url} target="_blank" rel="noreferrer" aria-label={`${source.title}（外部サイト）`}>
            <span>{source.title}</span><ExternalLink size={14} aria-hidden="true" />
          </a>
          <small>{sourceTypeLabels[source.source_type]} · {source.publisher}</small>
        </li>)}
      </ul>
    </div>
  </details>;
}
