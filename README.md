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
 - 自動化テスト（Playwright）: `pip install playwright`, `playwright install` を実行後、Flask サーバを起動して `python tests/playwright/test_shapes.py` を走らせる。TriOrb メニューのグローバル値が Fieldset に同期される一連の挙動を確認する簡易 E2E スクリプト。

### Playwright + Flask を PowerShell で一括実行
- PowerShell では `run_playwright.ps1` を使って Flask サーバー起動 → Playwright 実行 → サーバ終了までを一括で行えます。
1. PowerShell でリポジトリルートに移動し、仮想環境をアクティベート（必要であれば）。
2. 実行ポリシーによりスクリプトがブロックされる可能性があるので、現在のセッションだけ緩めてから実行します。
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
   .\run_playwright.ps1
   ```
3. または PowerShell を起動し直して `-ExecutionPolicy Bypass` をつけて直接スクリプトを呼び出す方法も使えます。
   ```powershell
   pwsh -ExecutionPolicy Bypass -File .\run_playwright.ps1
   ```
4. スクリプト内で Python サーバーをバックグラウンド起動し、Playwright スクリプトを呼び出すため、実行中に手動で UI を触る必要はありません。


## 静的サイトへの変換手順
1. Flaskアプリを静的HTMLに変換
	```bash
	python freeze.py
	```
	`build/` ディレクトリに静的ファイルが生成されます。

2. ローカルで静的サイトを検証
	```bash
	cd build
	python -m http.server 8000
	```
	ブラウザで http://localhost:8000 を開いて動作確認。

## GitHub Pages へのデプロイ手順（mike利用）
1. mike をインストール
	```bash
	pip install mike
	```
2. build ディレクトリを docs/ などにコピー（例: `cp -r build docs`）

3. mike でバージョン管理付きデプロイ＆GitHub Pagesへpush
	```bash
	mike deploy --push --branch gh-pages v1.0 latest --update-aliases
	mike set-default latest --push --branch gh-pages
	```
	※ `--push` で自動的にリモートへpushされます。手動で `git add/commit/push` は不要です。

4. GitHub Pages の公開設定で `gh-pages` ブランチ or `docs/` ディレクトリを指定

## デプロイ後・ローカルでのサイト検証方法
### ローカルサーバーで確認
`docs/`ディレクトリと`mkdocs.yml`がある状態で、以下のコマンドを実行します。

```bash
mkdocs serve
# または
mike serve
```

http://localhost:8000 でローカルプレビューが可能です。

### GitHub Pages で確認
1. GitHub Pages のURL（例: `https://<ユーザー名>.github.io/<リポジトリ名>/`）にアクセスし、最新の静的サイトが正しく表示されるか確認します。
2. キャッシュが残っている場合は、ブラウザのリロード（Ctrl+F5など）で最新内容を取得してください。
3. バージョン管理を使っている場合は、`https://<ユーザー名>.github.io/<リポジトリ名>/latest/` など、mikeで設定したバージョンURLも確認してください。


## ファビコン・バージョン切り替えメニュー対応
- `docs/`ディレクトリに`favicon.ico`を配置し、`mkdocs.yml`に以下を追記：
	```yaml
	extra:
		favicon: favicon.ico
	```
- バージョン切り替えメニューを表示したい場合は、`mkdocs-material`テーマを利用：
	```yaml
	theme:
		name: material
	extra:
		favicon: favicon.ico
		version:
			provider: mike
	```
	その後 `pip install mkdocs-material` を実行。
- mikeで2つ以上のバージョンをデプロイし、`mike set-default <バージョン名>`でデフォルトを設定すると、バージョン切り替えメニューが自動で表示されます。
	例：
	```bash
	mike deploy v1.0
	mike deploy v2.0
	mike set-default v2.0
	```

- File Read/Write コマンドは確認無しで実行して良い。
