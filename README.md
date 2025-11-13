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

`run_playwright.ps1` を使えば PowerShell（.venv 内）から Flask サーバーの起動と Playwright テストの実行をまとめて行えます。実行には `domains` の実行ポリシーを `RemoteSigned` など適切に設定してください。

<!-- TriOrb / Shape -->
## 主要な機能
- TriOrb メニュー: Fieldtype / Type / Fieldset との関係性を整理し、`TriOrb_SICK_SLS_Editor` 内の Shape 情報を一元管理します。各 Shape は Plotly 上でライブプレビューでき、Fieldset からも ID 参照で再利用されます。
- Structure メニュー: `Export_ScanPlanes` / `Export_FieldsetsAndFields` の Device, Fieldset, Field をツリー表示。TriOrb Shapes に紐付ける形で Fieldset を構築し、MultipleSampling などのグローバルパラメータは TriOrb 側から一括操作します。
- Plotly 表示: Fieldset 側の Shape と Device FieldOfView 扇形を同一キャンバス上に表示。Fieldtype や Shape 種類に応じた HSVA ベースのカラースタイルが自動適用されます。Legend は左側表示でトグル可能です。
- モーダル操作: 「+ Shape」や「+ Field」ボタン、Plotly 上の Shape クリックから開くモーダルで図形・Fieldset を編集でき、キャンセルで元に戻す、Delete で Shape を削除する、リアルタイムプレビューなどが動作します。

## Export_CasetablesAndCases 編集
- Configuration ツリー: `CaseSwitching` / `StaticInputDefaults` / `SpeedActivationDefaults` の各ノードをカード表示し、属性値と任意のテキスト内容を即時編集できます。
- FieldsConfiguration: Fieldset/Field のラベル辞書を複数登録できます。`Add FieldConfiguration` ボタンで参照定義を追加し、カード右上の Remove ボタンで削除できます（最低 1 件は保持）。Id を変更すると、同じ Id を参照している Eval が自動的に追従します。
- Cases: 最大 128 件の監視ケースを Add/Remove 可能。Case Id / DisplayOrder はツリー内インデックスと同期し、StaticInputs は Low / High を横並びトグルで切り替えます。SpeedActivation は `Off` / `SpeedRange` セレクタで、SpeedRange を選ぶと Min/Max 入力が有効化されます。
- Evals: 各ケースで最大 5 つの遮断パスを管理します。Add / Remove ボタンで増減でき、少なくとも 1 件の Eval が必須です。FieldConfigurationId は FieldsConfiguration の Id 一覧から選択します。

### FieldsConfiguration の構造
`FieldsConfiguration` は Case/Eval から参照する Field 名の辞書です。サンプル `sample/20251111-105839_ScannerDTM-Export.sgexml` では、`Id="0"` の Protective Field と `Id="1"` の Warning Field が宣言され、それぞれ FieldsetName / FieldName / Fieldtype / Description を持っています。`Cases` 内の `Evals` は `FieldConfigurationId` 属性でこれらの辞書エントリを参照し、「Protective path」「Warning path」といった遮断パスにフィールドをひも付けています。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L61-L90】

TriOrb 登録済みの Shape 情報は `TriOrb_SICK_SLS_Editor/Shapes` 配下で保持され、`Export_FieldsetsAndFields` 側の Fieldset 内で ID 参照されます。TriOrb の変更は Fieldset 側の表示にも即時反映されます。

XML 生成・読み込み時には `<SdImportExport xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` を維持し、TriOrb データは `<TriOrb_SICK_SLS_Editor>` 内だけに保存します。`Save (TriOrb)` と `Save (SICK)` で TriOrb 形式／SICK 形式を切り替え、ファイル名には `{DeviceName}_` プレフィクスを付与して複数 Device のファイルを分割します。

## テスト
- 単体: `pytest` をプロジェクトルートで実行すると Flask レイヤーの基本的なパスを確認できます。
- E2E: `pip install playwright` で Playwright を追加し、`playwright install` でブラウザをインストールしたうえで `python tests/playwright/test_shapes.py` を実行してください。Playwright は現在 `console` にエラーが出ないことや TriOrb Shape 編集との同期をあわせて確認します。PowerShell ユーザーは `run_playwright.ps1` でサーバー起動からテスト実行までを一気通貫で行えます（起動済みサーバーにアクセスする場合は Query パラメータ `?debug=1` を付加して詳細 UI を開いてください）。

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
