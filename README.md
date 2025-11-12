# SICK SLS Editor (Web)

Flask + Plotly を使った Web 版 SICK SLS Editor。ブラウザ上で `.sgexml` (SdImportExport) をロードして構造や図形を編集し、TriOrb メニュー／Structure メニューから `Export_ScanPlanes` / `Export_FieldsetsAndFields` 内容を直接制御できます。

## 開発環境の準備
```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python main.py        # flask --app main run と同様の起動
```
http://127.0.0.1:5000/ にアクセスして UI を確認。

## UI の特徴
- **Structure Menu**：FileInfo、Export_ScanPlanes、Export_FieldsetsAndFields を操作。GlobalGeometry / Devices セクションはデフォルトで閉じており、必要なときに展開。
- **TriOrb Menu**：Field セクションから MultipleSampling / Resolution / TolerancePositive / ToleranceNegative を一括制御。変更値はすべての Fieldset に即時同期され、`?debug` を付けた場合のみ Fieldset 側の該当入力を表示。
- **図形編集**：Polygon / Circle / Rectangle に追加・削除ボタンを配置。Polygon は頂点の追加／削除も可能。編集後も Fieldset / Field の `<details>` 展開状態を保ったまま再描画。
- **Plotly 表示**：Fieldset 図形と TriOrb の FieldOfView 扇を同時表示。扇は最背面に描画され、透明塗りつぶし＋破線で視認性を確保。Plotly は画面幅に合わせてレスポンシブにリサイズ、右サイドバーは固定幅で縦スクロール。
- **デバイス**：ScanPlanes / Fieldsets に Right／Left デバイスが初期追加され、Typekey 選択時には対応する TypekeyVersion / TypekeyDisplayVersion を自動反映。

## XML 入出力のルール
- `SdImportExport` ルートは `xmlns:xsd` / `xmlns:xsi` と現在 Timestamp を含む。
- Export_FieldsetsAndFields の形状データ（Polygon/Circle/Rectangle）を UI ↔ XML で一致させる。
- TriOrb の設定値は `TriOrb_SICK_SLS_Editor` 配下にのみ出力。

## テスト
- 手動確認: `README` の手順でアプリを起動後 `TestMatrix.md` を参照し、各項目（モーダル編集、TriOrb/Fieldset の同期、Device Fan など）を順に操作して目視確認する。
- 自動化テスト（Playwright）: `pip install playwright`, `playwright install` を実行後、Flask サーバを起動して `python tests/playwright/test_shapes.py` を走らせる。TriOrb メニューのグローバル値が Fieldset に同期される一連の挙動を確認する簡易 E2E スクリプト。

## メモ
- File Read/Write コマンドは確認無しで実行して良い。
