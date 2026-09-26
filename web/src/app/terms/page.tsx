import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return <LegalPage title="利用規約">
    <p>Cuckoo Cueは、タスクの段取りを探し、整え、実行するためのサービスです。本サービスの利用により本規約に同意したものとします。</p>
    <h2>利用者のデータ</h2><p>利用者は自分が入力した内容の権利を保持します。公開した版と棚は、公開中に限り本サービス内で他の利用者が閲覧し、自分のRunとして再利用できます。</p>
    <h2>禁止事項</h2><p>法令や他者の権利を侵害する利用、不正アクセス、サービス運用を妨げる行為を禁止します。</p>
    <h2>サービスの提供</h2><p>機能の改善、保守、やむを得ない事情により、内容の変更や一時停止を行うことがあります。重要な変更は合理的な方法で案内します。</p>
    <h2>問い合わせ</h2><p><a href="mailto:support@cuckoocue.hiyozoo.com">support@cuckoocue.hiyozoo.com</a></p>
  </LegalPage>;
}
