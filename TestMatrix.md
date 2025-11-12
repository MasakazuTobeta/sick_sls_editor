# TestMatrix.md

| 項目 | 手順 | 期待結果 |
| --- | --- | --- |
| Polygon/Circle/Rectangle のモーダル編集 | 1. `.sgexml` を読み込んで中の Fieldset を表示<br>2. Plotly 上で図形にマウスを合わせて表示されたツールチップをクリック<br>3. モーダルで座標を変更し Save をクリック | モーダルの値変更が即座に Plotly に反映される。Save 後も `Fieldsets` エリアへの反映と、XML への変化が整合する。 |
| TriOrb Field の共通パラメータ | 1. TriOrb Menu > Field で MultipleSampling/Resolution/Tolerance を変更<br>2. Fieldset 側の該当項目を確認 | すべての Fieldset の複数サンプリング値および四角形の Resolution/Tolerance が一致。`?debug` なしで Fieldset 側の入力が非表示、`?debug` ありで表示。 |
| Device Fan + FieldOfView | 1. TriOrb FieldOfView を変更<br>2. Devices の Rotation を設定<br>3. Plotly で扇が最背面に表示され、扇・マーカーともに動的に更新される | Device 位置は黒丸で、扇は最背面に描画され、FieldOfView/Rotation の変更がすぐさま反映される。 |
| Shape CRUD | 1. Fieldset > Shape セクションで Polygon にポイント追加/削除、Rectangle/Circle の追加・削除を実行<br>2. それぞれの操作後に Plotly を確認 | シェイプ数・頂点数が UI と Plotly 両方で一致。削除してもモーダルが閉じて再描画後も `details` 開閉状態が維持される。 |
| ファイル入出力の一貫性 | 1. サンプルのsgxmlを読み込み<br>2. 編集せずに保存 | Timestampを除き、元のXMLと同一内容で保存される。 |
| UIボタンのConsole安全性 | 1. サンプルXMLを読み込む<br>2. `New Plot`, `Save (XML)`, `Hide Legend`, `All check`/`All uncheck`、`Show All Shapes`/`Hide All Shapes` を順にクリック<br>3. DevTools の Console を確認 | どのボタン押下時も Console にエラーが出ず、ページや描画が壊れない |
