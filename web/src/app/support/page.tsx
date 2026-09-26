import { LegalPage } from "@/components/legal-page";

export default function SupportPage() {
  return <LegalPage title="サポート">
    <p>ログイン、同期、WebからiOSへのRun取り込み、アカウント削除などでお困りの場合は、下記へご連絡ください。</p>
    <h2>問い合わせ先</h2><p><a href="mailto:support@cuckoocue.hiyozoo.com">support@cuckoocue.hiyozoo.com</a></p>
    <h2>連絡時に含めてほしい情報</h2><ul><li>利用端末とOSのバージョン</li><li>問題が起きた操作と表示されたメッセージ</li><li>問題が起きた日時</li></ul>
    <p>パスワード、認証コード、秘密鍵は送らないでください。</p>
  </LegalPage>;
}
