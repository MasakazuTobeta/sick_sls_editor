# Architecture

## 全体像
- Flask (`main.py`) で `templates/index.html` をレンダリングし、Plotly 図や TriOrb/Casetable 情報を JSON で `window.appBootstrapData` に埋め込みます。
- `static/js/app.js` がエントリーポイントとして `window.appBootstrapData` を読み取り、DOM のセットアップ・Plotly 再描画・TriOrb/Casetable の UI を初期化します。
- フロントエンドの共通処理は `static/js/modules/` 配下に分割し、機能単位で再利用できるよう ES Modules でエクスポートしています。

## ディレクトリ/ファイル別メモ
| パス | 役割 |
| --- | --- |
| `templates/index.html` | UI コンテナとなる HTML。Plotly, Structure Menu, TriOrb Menu などの DOM を定義し、末尾で `window.appBootstrapData` を宣言した後に `static/js/app.js` を module として読み込みます。 |
| `static/js/app.js` | DOMContentLoaded 時に実行されるメインスクリプト。Plotly の描画、ファイル I/O、TriOrb/Fieldset/Casetable のイベントバインディングなど UI 全体を制御します。必要なヘルパーは `modules/*.js` から import します。 |
| `static/js/modules/colors.js` | Field/CutOut/TriOrb に応じた色決定ロジック。HSVA から RGB/HEX への変換、alpha 付きカラー生成、Legend 線種のスタイル計算を提供します。 |
| `static/js/modules/geometry.js` | 数値・角度の正規化、Plotly 図で使用する矩形コーナー計算などの幾何ユーティリティ。Fieldset 半径推定や FOV 扇形作図で再利用されます。 |
| `static/js/modules/triorbData.js` | TriOrb Shape データの初期化・ID 発番・デフォルト図形テンプレート、Polygon 文字列⇔配列変換、Kind 同期などデータモデル関連の処理をまとめています。 |

## データフロー
1. Flask 側 (`main.py`) が Plotly 図や Sgexml 各セクションの JSON を生成し、`window.appBootstrapData` として HTML に埋め込みます。
2. `app.js` が `bootstrapData` をクローンして状態を初期化し、Plotly/Structure/Casetable/TriOrb の描画関数を呼び出します。
3. ユーザー操作で状態が変わった場合は適宜 `renderFigure` や `renderTriOrbShapes`、`renderCasetable*` を呼び出し、必要に応じて `modules/` のヘルパーで計算・フォーマットを行います。

## メンテナンス Tips
- 新しい数値計算や図形フォーマッタが必要になった場合は `modules/geometry.js` や `modules/triorbData.js` を拡張し、`app.js` から import して利用してください。
- Flask 側のデータ追加は `window.appBootstrapData` に項目を追加し、`app.js` 内で取り出すだけでよいので、テンプレート内に巨大なスクリプトを埋め込む必要はありません。
- 既存モジュールの関数名はテストや他モジュールからも参照されるため、リネーム時は grep で利用箇所を確認してください。
