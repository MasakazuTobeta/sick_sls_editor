# Export_CasetablesAndCases/Casetable/FieldsConfiguration の構成メモ

## 全体像
- `FieldsConfiguration` は各 `Casetable` に 1 つ存在し、`Evals` から参照されるユーザーフィールド（可変フィールド）と統計フィールド（固定出力）を束ねる。`ScanPlanes` セクションで監視面とユーザーフィールド群を、`StatFields` セクションで出力固定値を宣言する構造になっている。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2666-L3383】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3599-L4316】
- サンプルでは 1 つのスキャンプレーン（Id=1, Name="Monitoring plane 1"）に 26 個の `UserFieldset` を割り当てており、Casetable 間で同一構成を共有している。これにより Evals では `UserFieldId` や `FieldMode` だけを指定すればよい。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2668-L3375】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3600-L4308】

## ScanPlanes / UserFieldsets
- `ScanPlanes/ScanPlane` 直下には以下の要素が入る。
  - `Index` / `Name`: スキャンプレーンの順序と表示名（例: Monitoring plane 1）。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2668-L2671】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3600-L3604】
  - `UserFieldsets`: フィールドセットのコレクション。Id=1〜26 が定義され、名称は方位＋距離（右0.65、前0.3 等）または役割（回転、Stop(minimum)）になっている。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2672-L3374】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3605-L4307】
- 各 `UserFieldset` の中身は共通のパターンで、以下のフィールドを持つ。
  | 要素 | 説明 |
  | --- | --- |
  | `Index` / `Name` / `NameLatin9Key` | フィールドセットの順序、表示名、ラテンキー。例: `Index=0` / `Name=右0.65` / `NameLatin9Key=_FSN000_9516`。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2672-L2704】 |
  | `UserFields` | 単一または複数のフィールドを束ねる。ほとんどのセットは 2〜3 個（Protective, Speed down, Speed up）、`Stop(minimum)` などは 1 個のみ。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2676-L3374】 |
- `UserField` 要素の定義内容:
  - `Id` と `Index`: Eval 側から参照されるユニーク ID と Fieldset 内での並び順。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2676-L3374】
  - `Name`: 役割名（Protective/Speed down/Speed up など）。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2678-L3374】
  - `FieldType`: 保護 (`ProtectiveSafeBlanking`) もしくは警告 (`WarningSafeBlanking`) の種別。ケースによっては Protective のみを持つ。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2679-L3374】
  - `MultipleSampling`: サンプリング数。通常は 2、停止最小値のみ 4。Evals 側では参照のみで変更しない。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2681-L3374】
  - `ObjectResolution`: 物体分解能。全フィールドで 70 を共有している。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2682-L3374】
  - `ContourNegative` / `ContourPositive`: 負/正側余白。サンプルはすべて 0 に揃っており、描画時にそのまま扱える。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2683-L3374】

## StatFields
- `StatFields` には常時出力されるフィールド ID が定義され、`PermRed`（59）、`PermGreen`（60）、`PermGreenWf`（61）の 3 つが存在する。Evals 側の `PermanentPreset` から `FieldMode=59` が参照されるため、ここを基準に固定出力を切り替える。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3378-L3383】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L4311-L4316】

## 実装時のポイント
1. Evals で `UserFieldId` を追加する場合は、必ず `FieldsConfiguration` に同じ ID の `UserField` を先に定義する。
2. スキャンプレーンを増やす場合は `FieldsConfiguration/ScanPlanes` を複数化し、それぞれに対応する `Cases/ScanPlane Id` を増やす。
3. `StatFields` の ID を更新したら、`PermanentPreset` や関連する UI 定数も合わせて変更して整合性を保つ。
