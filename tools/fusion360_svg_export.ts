/**
 * Fusion 360 向けの簡易 SVG エクスポート アドイン（TypeScript 版）。
 * - Sketch を選択して SVG として書き出すだけの最小構成。
 * - ファイルは Scripts/Add-Ins 配下に配置し、tsc でコンパイルして使用します。
 *
 * SICK SLS Editor の SVG インポート ワークフロー向けに、Fusion 側で
 * スケッチを SVG 化する用途を想定しています。
 */

// Fusion 360 ランタイムがグローバルに adsk オブジェクトを提供する。
declare const adsk: any;

type CommandHandler = (args: any) => void;

type Disposable = { remove: () => void };

const COMMAND_ID = "SlsEditor_SvgExport";
const COMMAND_NAME = "Export Sketch to SVG (SICK SLS)";
const COMMAND_DESCRIPTION = "選択した Sketch を SVG 形式で保存します";

let createdHandlers: Disposable[] = [];

function getApp() {
  return adsk.core.Application.get();
}

function getUi() {
  return getApp().userInterface;
}

function ensureDesign() {
  const design = adsk.fusion.Design.cast(getApp().activeProduct);
  return design || null;
}

function showError(message: string) {
  getUi()?.messageBox?.(message, "SVG Export");
}

function withCommandHandlers(command: any, onExecute: CommandHandler) {
  const execute = command.execute.add((eventArgs: any) => onExecute(eventArgs));
  const destroy = command.destroy.add(() => {
    createdHandlers = createdHandlers.filter((handler) => handler !== execute && handler !== destroy);
  });
  createdHandlers.push(execute, destroy);
}

function createCommandDefinition() {
  const ui = getUi();
  if (!ui) return null;
  const definitions = ui.commandDefinitions;
  let definition = definitions.itemById(COMMAND_ID);
  if (!definition) {
    definition = definitions.addButtonDefinition(COMMAND_ID, COMMAND_NAME, COMMAND_DESCRIPTION);
  }
  return definition;
}

function configureInputs(command: any) {
  const inputs = command.commandInputs;
  const selectionInput = inputs.addSelectionInput("sls-sketch", "Sketch", "SVG 化するスケッチを選択");
  selectionInput.addSelectionFilter("Sketches");
  selectionInput.setSelectionLimits(1, 1);

  const fileNameInput = inputs.addStringValueInput("sls-filename", "ファイル名", "sls-sketch.svg");
  const singleLayerInput = inputs.addBoolValueInput("sls-single-layer", "単一レイヤーで出力", true, "", true);
  const fitToPageInput = inputs.addBoolValueInput("sls-fit", "用紙に合わせる", true, "", true);

  return { selectionInput, fileNameInput, singleLayerInput, fitToPageInput };
}

function exportSketch(args: any) {
  const design = ensureDesign();
  if (!design) {
    showError("Design ワークスペースで実行してください。");
    return;
  }

  const ui = getUi();
  if (!ui) return;

  const inputs = args.command.commandInputs;
  const selectionInput = inputs.itemById("sls-sketch");
  const fileNameInput = inputs.itemById("sls-filename");
  const singleLayerInput = inputs.itemById("sls-single-layer");
  const fitToPageInput = inputs.itemById("sls-fit");

  const selection = selectionInput.selection(0);
  const sketch = selection?.entity;
  if (!sketch) {
    showError("Sketch を 1 件選択してください。");
    return;
  }

  const folderDialog = ui.createFolderDialog();
  folderDialog.title = "SVG の出力先フォルダーを選択";
  if (folderDialog.showDialog() !== adsk.core.DialogResults.DialogOK) {
    return;
  }

  const baseName = String(fileNameInput.value || `${sketch.name || "sketch"}.svg`).replace(/\.svg$/i, "");
  const filePath = `${folderDialog.folder}/${baseName}.svg`;

  const exportManager = design.exportManager;
  const options = exportManager.createSVGExportOptions(sketch, filePath);
  options.isSingleLayer = Boolean(singleLayerInput.value);
  options.isFitToPage = Boolean(fitToPageInput.value);
  options.isViewScaled = true;
  // Polygon の切れ目（パス分割）はスケッチ内のクローズドプロファイルごとに
  // Fusion 標準の SVG Export が自動で区切る。個別の頂点を分割する処理は
  // 行っていないため、エッジを明示的に分けたい場合はスケッチ側で輪郭を
  // それぞれ独立したプロファイルとして作図する。

  const succeeded = exportManager.execute(options);
  if (succeeded) {
    ui.messageBox(`SVG を保存しました:\n${filePath}`, "SVG Export");
  } else {
    showError("SVG の保存に失敗しました。");
  }
}

function onCommandCreated(args: any) {
  const command = args.command;
  configureInputs(command);
  withCommandHandlers(command, exportSketch);
}

export function run(_context?: any) {
  const commandDefinition = createCommandDefinition();
  if (!commandDefinition) {
    showError("UI を初期化できませんでした。");
    return;
  }
  const created = commandDefinition.commandCreated.add(onCommandCreated);
  createdHandlers.push(created);
  commandDefinition.execute();
  adsk.autoTerminate(false);
}

export function stop(_context?: any) {
  const ui = getUi();
  const commandDefinition = ui?.commandDefinitions?.itemById(COMMAND_ID);
  if (commandDefinition) {
    commandDefinition.deleteMe();
  }
  createdHandlers.forEach((handler) => handler.remove?.());
  createdHandlers = [];
}
