# SICK SLS Editor (Web)

フロントエンドは Flask + Plotly、という Web ベースの SdImportExport(.sgexml) 編集ツールです。
TriOrb メニュー、Structure メニュー、Plotly 上の図形・扇形表示などを連動させ、現場の構成情報を手早く確認・調整できます。

## ローカル開発の流れ
1. 依存関係をインストールします。
   ```bash
   pip install -r requirements.txt
   ```
2. Flask を起動します。
   ```bash
   python main.py
   ```
3. http://localhost:5000/ または http://127.0.0.1:5000/ をブラウザで開いて UI を確認します。

`npm install` で `package.json` の npm スクリプトが利用できるようになります。セットアップを自動化したい場合は以下を実行して venv 作成・依存関係インストール・Playwright ブラウザの準備をまとめて行えます。

```bash
npm run setup
```

`run_playwright.ps1` を使えば PowerShell（.venv 内）から Flask サーバーの起動と Playwright テストの実行をまとめて行えます。実行には `domains` の実行ポリシーを `RemoteSigned` など適切に設定してください。

### 依存ライブラリ補足
現在は主要コンポーネント（Flask / Plotly / Playwright など）に必要なライブラリのみを `requirements.txt` へ記載しています。

<!-- TriOrb / Shape -->
## 主要な機能
- TriOrb メニュー: Fieldtype / Type / Fieldset との関係性を整理し、`TriOrb_SICK_SLS_Editor` 内の Shape 情報を一元管理します。各 Shape は Plotly 上でライブプレビューでき、Fieldset からも ID 参照で再利用されます。
- Structure メニュー: `Export_ScanPlanes` / `Export_FieldsetsAndFields` の Device, Fieldset, Field をツリー表示。TriOrb Shapes に紐付ける形で Fieldset を構築し、MultipleSampling などのグローバルパラメータは TriOrb 側から一括操作します。
- Plotly 表示: Fieldset 側の Shape と Device FieldOfView 扇形を同一キャンバス上に表示。Fieldtype や Shape 種類に応じた HSVA ベースのカラースタイルが自動適用されます。Legend は左側表示でトグル可能です。
- モーダル操作: 「+ Shape」や「+ Field」ボタン、Plotly 上の Shape クリックから開くモーダルで図形・Fieldset を編集でき、キャンセルで元に戻す、Delete で Shape を削除する、リアルタイムプレビューなどが動作します。

TriOrb 登録済みの Shape 情報は `TriOrb_SICK_SLS_Editor/Shapes` 配下で保持され、`Export_FieldsetsAndFields` 側の Fieldset 内で ID 参照されます。TriOrb の変更は Fieldset 側の表示にも即時反映されます。

XML 生成・読み込み時には `<SdImportExport xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` を維持し、TriOrb データは `<TriOrb_SICK_SLS_Editor>` 内だけに保存します。`Save (TriOrb)` と `Save (SICK)` で TriOrb 形式／SICK 形式を切り替え、ファイル名には `{DeviceName}_` プレフィクスを付与して複数 Device のファイルを分割します。

## フロントエンド構成
- Flask 側から渡される Plotly 図・TriOrb・Casetable 等の初期データは `templates/index.html` で `window.appBootstrapData` にまとめ、`static/js/app.js` から参照します。
- `static/js/app.js` は UI 全体のイベントと状態管理を担うエントリーポイントで、機能別に `static/js/modules/` 以下のモジュールを読み込みます。
  - `modules/colors.js`: Field/CutOut/TriOrb 用の HSVA ベースのカラープロファイル、alpha 付きカラー変換、線種の算出ロジック。
  - `modules/geometry.js`: Plotly 描画や Fieldset 測定で再利用する数値正規化・角度計算・矩形座標算出などのジオメトリユーティリティ。
  - `modules/triorbData.js`: TriOrb Shape の初期化・ID 発番・デフォルト図形生成・Polygon 文字列変換などデータモデル周りの処理。
- 詳細な依存関係やディレクトリ構成は `Architecture.md` にまとめています。UI を拡張する際は同ドキュメントを参照し、既存モジュールを再利用してコードを分割してください。

## テスト
- 単体: `pytest` をプロジェクトルートで実行すると Flask レイヤーの基本的なパスを確認できます。
- E2E: `pip install playwright` で Playwright を追加し、`playwright install` でブラウザをインストールしたうえで `python tests/playwright/test_shapes.py` を実行してください。Playwright は現在 `console` にエラーが出ないことや TriOrb Shape 編集との同期をあわせて確認します。PowerShell ユーザーは `run_playwright.ps1` でサーバー起動からテスト実行までを一気通貫で行えます（起動済みサーバーにアクセスする場合は Query パラメータ `?debug=1` を付加して詳細 UI を開いてください）。

### 回帰テストの観点
- `tests/test_legacy_shape_attachment.py`: Safety Designer 形式（TriOrb セクションなし）で読み込んだファイルに「+ Shape」で Fieldset へアタッチした Shape が、`Save (SICK)` で生成される XML に含まれることを自動検証します。
- `tests/test_save_load_roundtrip.py`: TriOrb 形式を含む入出力を通して Fieldset/Shape の整合性を確認します（環境に Playwright のブラウザが無い場合、Playwright 依存のケースはスキップされます）。

## デプロイ
- `freeze.py` で静的ファイル出力（`docs/`）。`mkdocs.yml` に `mike` 注記があるので GitHub Pages は `mike deploy` + `mike set-default` で管理します。
- `.github/workflows/test.yml` で `pytest` を実行、`.github/workflows/deploy.yml` で `mike deploy --push --branch gh-pages latest --update-aliases` を走らせます。

## チェックポイント
- TriOrb Shape の追加・編集・削除でコンソールエラーが発生しないこと
- `Save (TriOrb)` / `Save (SICK)` でファイル分割・命名規則（`{DeviceName}_`）が守られていること
- Plotly 上のチェックボックス群（Fieldset / Shapes）や toggle ボタンで表示/非表示が切り替わること
- Device FieldOfView 扇形や Fieldset 図形の色が HSVA ベースの設定に従っていること

必要があれば `TestMatrix.md` に手動確認項目を追記してください。

## + Field モーダルの概要
- Fieldset 名と Latin9 Key を自動生成し、Protective/Warning それぞれで Type=Field/CutOut の Shape 選択を可能にする UI を追加しました。
- 選択中の Shape は Plotly 上に赤/オレンジ/黒でリアルタイムプレビューされ、OK で Fieldset+Field（Shape 参照込み）を保存します。
- Cancel で破棄、Shape 未選択でも Fieldset 保存可能。モーダルはドラッグ＆リサイズで配置変更できます。
