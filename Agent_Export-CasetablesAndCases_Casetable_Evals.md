# Export_CasetablesAndCases/Casetable/Evals の構成メモ

## 概要
- `Export_CasetablesAndCases` 配下の各 `Casetable` は、ひとつの `Evals` セクションを持ち、ここで評価ロジック（遮断パス）の一覧が定義される。サンプルでは 2 つの `Casetable` があり、1 件目は Eval×3（遮断パス1〜3）、2 件目は Eval×2（遮断パス4〜5）で構成されている。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1959-L2665】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3527-L3598】
- 各 `Eval` 要素には `Id` 属性が付与され、並列する子要素で名称や再起動条件、ケースの割り当てを明示する。同じ `FieldMode`／`UserFieldId` を参照することで、別 Casetable 間でも同一のフィールド構成を再利用できる。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1960-L2186】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3528-L3589】

## Eval 要素の定義
| 子要素 | 役割 | 備考 |
| --- | --- | --- |
| `Name` | UI 表示用の遮断パス名。 | 例: 「遮断パス 1」〜「遮断パス 5」。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1960-L2434】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3529-L3566】 |
| `NameLatin9Key` | ラテン文字キー。多言語キーや内部識別子として利用。 | `_COPN01_8A74` など固有キーが並ぶ。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1961-L2433】 |
| `Q` | 遮断パス番号。 | 1〜5 が連番で入る。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1962-L2433】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3531-L3566】 |
| `Reset` | リセット条件をまとめたブロック。 | `ResetType`（例: `NoReset`）、`AutoResetTime`（秒単位）、`EvalResetSource`（制御名）がセットされる。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1964-L1968】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3532-L3570】 |
| `Cases` | 状態ごとのフィールド割り当て。 | 詳細は後述。`Case Id` ごとに `ScanPlanes/ScanPlane` をぶら下げる。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1969-L2655】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3537-L3589】 |
| `PermanentPreset` | 常時適用されるフィールドモード。 | 全 Eval が `FieldMode`=59 を参照し、警告/保護フィールドの固定モードを示す。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2187-L2193】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3555-L3596】 |

## Cases の構造
- `Cases` は連番の `Case` 要素を束ね、各ケースでどの `UserField`（＝Fieldset/Field）を使うかを `ScanPlanes` 経由で指定する。
  - サンプルの Casetable 0（Eval 1）では `Case Id="0"`〜`26` まで 27 通りを用意し、速度段や警告段に応じた `UserFieldId` をマッピングしている。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1969-L2186】
  - `Case` 直下の `ScanPlanes/ScanPlane` は監視面単位の設定で、`Id="1"` のスキャンプレーンに対して `UserFieldId` と `IsSplitted` フラグ（分割フィールドかどうか）を与える。`IsSplitted=true` は細分化された警告フィールド、`false` は通常フィールドを意味する。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L1970-L2105】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2440-L2649】
  - Casetable 1 の Eval ではケース数が 2 件ずつで、いずれも `UserFieldId` 58/59/9/10 を割り当てており、簡易な切替ロジックになっている。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3537-L3589】
- `UserFieldId` と `FieldMode` は `FieldsConfiguration` 側の `UserField`／`StatFields` とリンクするため、Evals では「どのケースでどのフィールドをアクティブにするか」を宣言するのみで、幾何情報は保持しない。

## PermanentPreset
- 各 Eval 共通で `PermanentPreset/ScanPlanes/ScanPlane` を 1 件だけ持ち、そこに `FieldMode` を記述する。サンプルでは全て `59` で固定出力を指定しており、デバイス初期化時に参照する安全フィールドモードが定義されている。【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L2187-L2193】【F:sample/20251111-105839_ScannerDTM-Export.sgexml†L3555-L3596】

