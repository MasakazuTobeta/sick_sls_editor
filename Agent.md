# Agent.md

## プロジェクト概要
- Flask + Plotly を利用した Web ベースの SICK SLS Editor プロトタイプ
- クライアント側のみで Plotly グラフの新規作成・XML 保存/読込が可能

## 依存パッケージ
- Flask
- plotly

## 実行方法
1. `python -m venv .venv`
2. `./.venv/Scripts/activate`
3. `pip install -r requirements.txt`
4. `python main.py` または `flask --app main run` を実行し、 http://127.0.0.1:5000/ を開く

## 今後のタスク
- SGE XML の詳細データ取り込みと可視化
- スキャナーパラメータ／ログ表示 UI
- lint・型チェックなど品質管理の整備

## 注意事項
- Thinking 中での Python コマンド実行は最小限に抑えること。
- FileInfo と TriOrb メニューの値を混在させない（TriOrb メニュー値は `TriOrb_SICK_SLS_Editor` 配下に出力）。
- Export_FieldsetsAndFields の図形データ（Polygon/Circle/Rectangle）を漏れなく保持し、XML と整合させる。
- MultipleSampling は TriOrb メニューの設定値で全 Field を同期させる。
- Export_FieldsetsAndFields の Device 名は Typekey 選択に統一し、TypekeyDisplayVersion/TypekeyVersion は Export_ScanPlanes 由来で自動同期させる。
- 保存時は `SdImportExport` に `xmlns:xsd`/`xmlns:xsi` と現在 Timestamp を付与し、属性順序はサンプル XML に倣う。

## コミュニケーション方針
- このプロジェクトに関するやり取りは日本語で行う。
- Agent からの報告や提案も日本語でまとめる。
- File Read/Write command は確認無しで実行して良い。
- File Read/Writeコマンドは確認無しで実行して良い
