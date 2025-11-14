# Agent.md

- Frozen-Flask / Playwright / mkdocs など複数のスタックが混在するため、依存パッケージは `requirements.txt` を共有し、Python `/` Playwright 両方の実行準備を行う。
- TriOrb 関連: `TriOrb_SICK_SLS_Editor` 以下に Shapes を集約し、Fieldset 側は Shape ID 参照で展開する。Fieldset 側の MultipleSampling / Resolution / Tolerance± などは TriOrb 側横断設定で同期し、`?debug` 付きで詳細ブロックを表示する。
- Structure Menu: Export_ScanPlanes / Export_FieldsetsAndFields の Device は DeviceName で連携し、Save (SICK) では DeviceName をプレフィクスにしたファイルを個別生成。TriOrb 形式の保存は `Save (TriOrb)` へ、旧形式も残す。
- Plotly 表示: Fieldset や Shape を HSVA カラーで出力、Legend Toggle・チェックボックス（今はトグルボタン）で表示制御、Device 扇形は常に最背面に置く。Graph 上の Shape クリックからモーダルを開いて編集でき、Add/Cancel/Delete の挙動を確認する。
- モーダル: +Shape / +Field で Shape/Fieldset を登録する際は、モーダルで Fieldset チェックをトグル形式に変更済、Cancel で元に戻る・モーダルはドラッグ/リサイズ可能・削除ボタンは編集モードのみ表示。
- ファイル読み書きは今後確認不要（承認済）なので、必要に応じて `python main.py` や Playwright 実行で上書き・保存してよい。
- `<SdImportExport>` 以下の構造は変更しない。TriOrb 情報は `<TriOrb_SICK_SLS_Editor>` に格納し、それ以外のセクションと混在させない。Load 時には TriOrb メタ情報で形式を判別する。
- コード変更時は必ずブラウザで起動し、コンソールにエラーが出ていないことを確認する（`renderFieldsets`/`renderFigure` 周りで録画され続ける mis-synced trace がないか検証）。

## テスト & 手動確認
- ユニット: `pytest`
- Playwright: `run_playwright.ps1` または `python tests/playwright/test_shapes.py`（PowerShell では DB・browser install などを先に行う）。Playwright は `?debug=1` で TriOrb UI を展開し `global-multiple-sampling` 等の入力待ちの状態までカバーする。
- 手動: `TestMatrix.md` に書き起こされたチェック項目（TriOrb Shapes 編集、Fieldset/Shape トグル、Save 形式 1/2、Device 別ファイル出力など）を走らせる。

## CI / デプロイ
- `.github/workflows/test.yml`: `pytest`
- `.github/workflows/deploy.yml`: `mike deploy --push --branch gh-pages latest --update-aliases`

## 直近の留意事項
- `TriOrb Shapes` / `Fieldsets` / `Devices` は JS 側の同期が肝。Shape 編集後 `renderTriOrbShapes()`→`renderFieldsets()`→`renderFigure()` までの再描画が行われて console が silent になることを確認。
- PowerShell スクリプト `run_playwright.ps1` は既に存在し、サーバー起動と Playwright テストを連続実行する。必要なら `Set-ExecutionPolicy RemoteSigned` を実行しておく。
- TriOrb モーダルでは、Fieldset チェックのトグル化とモーダルのドラッグ/リサイズ、Add/Edit/Delete の区別、Cancel での値リセットが揃っていることを確認する。
- `README.md` を常に最新化して、Playwright 実行手順や `pip install -r requirements.txt` などのセットアップを明文化する。これらが現場のドキュメントとなる。
- +Field モーダル: Protective/Warning の Field 内で Type=Field/CutOut ごとの Shape 選択と Plotly プレビュー、OK/Cancel で Fieldset を保存/破棄できる UI を導入しました。

## Structure Menu機能要件
- リスト要素はツリーで閉じられること
- リスト要素はAddとRemoveが出来ること（Removeは最低1個残すこと）
- 数値であることが分かっているInputboxは数値入力のみを受け付けること（原則stepは1）
- true/falseであることが分かっているInputboxはチェックボックスとすること
- enumであることが分かっているInputboxはセレクタとすること（選択肢が4個以下の場合は横並びのトグルボタン）
- Save (SICK) で出力されるXML構造はsample\20251111-105839_ScannerDTM-Export.sgexmlと一致すること

## Export_CasetablesAndCases編集機能要件
- このアプリではCasetableはIndex="0"のみを取り扱う
- Configurationツリーはsample\20251111-105839_ScannerDTM-Export.sgexmlの定義を参考に、Structure Menu/Export_CasetablesAndCases以下にConfigurationツリーを作って各種Inputboxを作成
- Casesツリーは、監視ケースを最大128個Add出来る
    - 監視ケースはAddもRemoveも出来る
    - Case Idはツリー内リストのIndexとする
    - DisplayOrderはツリー内リストのIndexとする（Case Idと一致）
    - StaticInputs/StaticInputはLow,Highのenum
    - SpeedActivationはOff/SpeedRangeのenum
- Evalsツリーの基本構成は[Agent_Export-CasetablesAndCases_Casetable_Evals.md](./Agent_Export-CasetablesAndCases_Casetable_Evals.md)を参照
    - Evalは1～5個の範囲でAdd/Remove出来る
    - Eval/Casesツリー内のCase数は、Export_CasetablesAndCases/Casetable/Casesの数と一致すること
    - Eval/Cases/Case内のScanPlanesツリーにはScanPlaneが1個とする
    - Eval/Cases/Case/ScanPlanes/ScanPlane内のUserFieldIdはTriOrb Menuに定義されたShapeの1始まりIndex（FieldsetのIndexではなく、Field=ShapeのIndex）。ただしデフォルトで3個のFieldが末尾Indexに用意されるため、Shapeが0個のときも1-3は設定できる。
- FieldsConfigurationツリーの基本構成は[Agent_Export-CasetablesAndCases_Casetable_FieldsConfiguration.md](./Agent_Export-CasetablesAndCases_Casetable_FieldsConfiguration.md)を参照
    - (構造確認中)