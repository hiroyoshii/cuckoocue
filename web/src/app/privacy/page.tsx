import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return <LegalPage title="プライバシーポリシー">
    <p>Cuckoo Cueは、タスクの検索、保存、実行、端末間同期のために必要な情報を取り扱います。</p>
    <h2>取得・利用する情報</h2>
    <ul><li>GoogleまたはAppleログインで提供されるユーザーID、表示名、メールアドレス</li><li>作成したリスト、Run、完了状況、公開した版と棚</li><li>検索内容と、検索体験を調整するために生成された利用者ごとのメモリ</li><li>安全な運用と不具合調査に必要なアクセス情報</li></ul>
    <h2>公開情報</h2>
    <p>利用者が公開操作をしたリストの版と棚は、他の利用者が閲覧・再利用できます。非公開の下書きやRunは公開されません。</p>
    <h2>アカウントの削除</h2>
    <p>アプリのアカウント画面から削除できます。非公開リスト、同期したRun、プロフィールメモリ、公開した版と棚を削除し、他の棚にある公開版への参照も外します。他の利用者が削除前に自分のRunとして取り込んだコピーは、その利用者のデータとして残ります。</p>
    <h2>問い合わせ</h2><p><a href="mailto:support@cuckoocue.hiyozoo.com">support@cuckoocue.hiyozoo.com</a></p>
  </LegalPage>;
}
