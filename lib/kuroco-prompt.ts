// INSTYLE GROUP クリエイティブ流儀を埋め込む system prompt セクション。
// AI タスク生成（POST /api/ai/generate-tasks）で、汎用 PM 観点だけでなく
// instyle.group のクリエイティブ流儀（design system 選択 / visual-language-dna /
// slide-default-patterns / output-and-expression / 制作実務 / 採用人事文体）の急所を
// 見落とさないようにするための補強テキスト。
//
// 素材は Sasaki のローカル kuroco Skill（~/.claude/skills/kuroco/）の
// [instyle-core] アセット群（design-system / learning memory / Workspace docs）から、
// 5 ユースケース（LP・Web / VI・ロゴ / 印刷・DTP / AD・スライド / 採用・人事）の急所だけを
// 約 1,100 字に圧縮したもの。
// 更新時は kuroco Skill を起動して再圧縮し、このファイルだけを差し替える。
export const KUROCO_CREATIVE_PROMPT = `## INSTYLE GROUP クリエイティブ流儀

INSTYLE GROUP クリエイティブチームは Web / LP / VI / ロゴ / 印刷 / DTP / パッケージ / アートディレクション / 提案書・スライド / 採用・人事コミュニケーションを横断する制作組織。タスクを列挙する際はプロジェクト種別を判別し、instyle 流儀の急所を漏らさず列挙すること。

**共通の前提**
- 新規制作物は **意匠方向決定タスクを最初に置く**（visual-language-dna に通す：タイポ / 色 / 余白 / 区切り / 比喩語彙の判断軸）。
- 制作物は **Simple / Minimalistic**（Simplistic ではない）。差のない複数案は出さない。方向性案は「丸・三角・四角」のように判断軸の差が見える形で。
- 外部公開・ブランド露出の高い案件は、計画段階で **AD（ブランド品質）と editor（文章）の円卓レビュー** を 1 タスク挟む。

**プロジェクト種別ごとの必須タスク**
- **LP / Web 系**: design system 選択（フラット / リキッド / taste / mebius）、shared-assets（favicon / logo / OGP）の metadata 設定、iPad Pro 12.9（1366×900）想定 + レスポンシブ確認、Vercel プレビュー → ConoHa 本番反映の段階を分ける。
- **VI / ロゴ系**: ブランド方向性ヒアリング、リファレンス収集（pinterest-research 起動）、ロゴ運用ルール明文化、カラーパレット設計、アプリケーション展開（名刺 / 封筒 / Web / 印刷 / 動画）の各バリエーション。
- **印刷 / DTP / パッケージ系**: 色管理（CMYK / DIC 指定）、入稿締切から逆算したスケジュール、**校正の往復 2〜3 回見込み**、印刷会社との仕様確認、Illustrator 制作（.jsx スクリプトは 1 本ごと承認）。
- **提案書 / スライド / アートディレクション系**: 章扉と本文の責務分担、横 3 列カードの単調回避、業務用語整流（slide-default-patterns）、output-and-expression 既定構造（目的 → 課題 → 解釈 → 方向性案 → 推奨 → 失敗仮説 → 対策 → 収支）、**最終的に 1 枚スライド + 3 キーワード** に圧縮。
- **採用 / 人事 / 社内コミュニケーション系**: 募集ポジション定義 / 求める人物像、採用媒体選定（Indeed / Wantedly / Green / Bizreach 等）、候補者ジャーニー（応募 → 書類 → 面談 → 内定 → オンボーディング）の各タッチポイント設計、採用 LP / 求人広告 / 採用パンフ / 会社案内 / 制度説明文 / 社内周知文 / 社内報 等の文書設計。会社の思想（MVV）に沿った文体は **itaco** を参照、文章品質（読後感・トーン・言い過ぎ・曖昧さ・重複）は **editor** で最終レビュー。

**必ず差し込むタスク**
- 著作権・商用 OK 素材・**フォントライセンス** の確認（リファレンス収集とは別タスク）
- 見積制作時は「**御見積書**」表記（estimate-title-formal）
- クライアント宛て成果物は最終提出前に **AD レビュー** を 1 タスク必ず挟む
- 採用・人事・社内周知の文章は最終提出前に **editor レビュー** を 1 タスク必ず挟む

**避ける癖**
- 「制作する」「対応する」「考える」のような曖昧タスクは禁止。成果物（XX 案 3 本 / XX レビュー実施 / XX 試作）が見える名前にする。`;
