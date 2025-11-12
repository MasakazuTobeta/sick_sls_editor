# Agent.md

## プロジェクト概要
- Flask + Plotly を使った Web 版 SICK SLS Editor。Plotly 上で図形を編集しながら `.sgexml` (SdImportExport) を入出力する。
- 編集対象は `Export_ScanPlanes` / `Export_FieldsetsAndFields` / TriOrb メニュー。TriOrb メニュー値は `TriOrb_SICK_SLS_Editor` 配下に書き出す。

## 依存パッケージ
- Flask
- Plotly

## 起動方法
1. `python -m venv .venv`
2. `.\.venv\Scripts\activate`
3. `pip install -r requirements.txt`
4. `python main.py` もしくは `flask --app main run`

## 現状の主要タスク
- サンプル XML (`sample/20251111-105839_ScannerDTM-Export.sgexml`) をベースに UI と XML を同期させる
- Plotly での図形（Polygon / Rectangle / Circle）描画、編集、保存
- TriOrb メニューや Structure Menu の編集体験改善

## 注意点・ナレッジ
- Thinking 中の Python コマンド実行は最小限にする
- FileInfo と TriOrb のデータを重複させない。TriOrb の値は `TriOrb_SICK_SLS_Editor` にのみ出力
- `Export_FieldsetsAndFields` の Polygon/Circle/Rectangle は UI ↔ XML 間で必ず一致させる
- Global 行動  
  - MultipleSampling / Resolution / Tolerance± は TriOrb メニューの Field セクションで一括管理。値変更時は全 Field に反映  
  - デバッグ用に `?debug` を付けた URL でフィールド個別入力を表示可能
- Devices  
  - `Export_ScanPlanes` と `Export_FieldsetsAndFields` には Right/Left デバイスをデフォルト追加  
  - Typekey 選択で TypekeyVersion / TypekeyDisplayVersion をスキャンプレーンから補完
- Plotly オーバーレイ  
  - Fieldset 図形と TriOrb の FieldOfView 扇を同時に描画。扇は最背面に描画し、StandingUpsideDown などの属性変化に追随
- XML 出力時は `SdImportExport` に `xmlns:xsd` / `xmlns:xsi` と最新 Timestamp を必ず含め、サンプル XML と同じ要素順を保つ
- `<SdImportExport>` 以下の構造は変更を避け、TriOrb はあくまで `<TriOrb_SICK_SLS_Editor>` 配下で扱う
- ファイル読み書きコマンド（保存/読み込みなど）は Agent 承認なしにそのまま実行してよい
- ファイル内容を変更した場合、最低限開いたときにConsoleエラーが出ないことをテストすること

## テスト
- `tests/` 配下にユニットテストを配置
- `pytest` を使用してテストを実行
- テスト項目はTestMatrix.mdを参照

## コミュニケーション
- プロジェクトに関する質問や共有事項は速やかに報告する
- Agent 自身の作業状況も適宜共有する
- 原則日本語で応答する