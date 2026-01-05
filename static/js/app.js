import { pickFieldColor, pickTriOrbColor, resolveShapeStyle, withAlpha } from "./modules/colors.js";
import {
  degreesToRadians,
  getRectangleCornerPoints,
  rotatePoint,
  rotatePointWithEllipse,
  normalizeDegrees,
  parseNumeric,
} from "./modules/geometry.js";
import {
  applyShapeKind,
  buildShapeKey,
  createDefaultCircleDetails,
  createDefaultPolygonDetails,
  createDefaultRectangleDetails,
  createDefaultTriOrbShape,
  createShapeId,
  formatPolygonPoints,
  getPolygonTypeValue,
  initializeTriOrbShapes,
  parsePolygonPoints,
  setPolygonTypeValue,
} from "./modules/triorbData.js";

document.addEventListener("DOMContentLoaded", () => {
        const bootstrapData = window.appBootstrapData || {};
        const defaultFigure = JSON.parse(JSON.stringify(bootstrapData.defaultFigure || {}));
        defaultFigure.data = defaultFigure.data || [];
        const rootAttributes = bootstrapData.rootAttributes || {};
        const initialScanPlanes = bootstrapData.scanPlanes || [];
        const fieldsetData = bootstrapData.fieldsets || {};
        const initialFieldsets = fieldsetData.fieldsets || [];
        const initialFieldsetDevices = fieldsetData.devices || [];
        const initialFieldsetGlobal = fieldsetData.global_geometry || {};
        const casetablePayloadRaw = bootstrapData.casetablePayload || {};
        const casetablePayload = {
          casetable_attributes: { Index: "0" },
          configuration: null,
          cases: [],
          evals: null,
          fields_configuration: null,
          layout: [
            { kind: "configuration" },
            { kind: "cases" },
            { kind: "evals" },
            { kind: "fields_configuration" },
          ],
          ...casetablePayloadRaw,
        };

        const figureConfig = { responsive: true, displaylogo: false };
        const circleSampleSegments = 72;
        const legendLabelMaxLength = 36;
        const defaultScanDeviceTemplates = [
          { DeviceName: "Right" },
          { DeviceName: "Left" },
        ];
        const defaultFieldsetDeviceTemplates = [
          {
            DeviceName: "Right",
            PositionX: "170",
            PositionY: "102",
            Rotation: "290",
            StandingUpsideDown: "true",
          },
          {
            DeviceName: "Left",
            PositionX: "-170",
            PositionY: "102",
            Rotation: "70",
            StandingUpsideDown: "true",
          },
        ];
        const shapeTypeOptions = {
          polygon: ["CutOut", "Field"],
          rectangle: ["Field"],
          circle: ["Field"],
        };
        const structureAttributeSchemas = {
          scanPlane: {
            Index: { type: "number", min: 0, step: 1 },
            Name: { type: "text" },
            ScanPlaneDirection: { type: "enum", options: ["Horizontal", "Vertical"], defaultValue: "Horizontal" },
            UseReferenceContour: { type: "boolean", checkboxLabel: "Enabled" },
            ObjectSize: { type: "number", min: 1, step: 1 },
            MultipleSampling: { type: "number", min: 2, max: 16, step: 1 },
            MultipleSamplingOff2OnActivated: { type: "boolean", checkboxLabel: "Enabled" },
            SelectedCaseSwitching: { type: "enum", options: ["Fast", "Slow"], defaultValue: "Fast" },
          },
          scanPlaneDevice: {
            Index: { type: "number", min: 0, step: 1 },
            ResponseTime: { type: "number", min: 0, step: 1 },
            ScanResolutionAddition: { type: "number", step: 1 },
          },
          fieldsetDevice: {
            PositionX: { type: "number", step: 1 },
            PositionY: { type: "number", step: 1 },
            Rotation: { type: "number", step: 1 },
            StandingUpsideDown: { type: "boolean", checkboxLabel: "Upside down" },
          },
          fieldsetGlobal: {
            UseGlobalGeometry: { type: "boolean", checkboxLabel: "Enabled" },
          },
          casetableCase: {
            SleepMode: { type: "boolean", checkboxLabel: "Enabled" },
          },
        };

        function buildDatasetAttributes(dataset = {}) {
          return Object.entries(dataset)
            .map(([key, rawValue]) => {
              if (rawValue === undefined || rawValue === null) {
                return "";
              }
              return `data-${key}="${escapeHtml(String(rawValue))}"`;
            })
            .filter(Boolean)
            .join(" ");
        }

        function isTrueValue(value) {
          return String(value ?? "").toLowerCase() === "true";
        }

        function resolveStructuredInputValue(target) {
          if (!target) {
            return "";
          }
          const valueType = target.dataset.valueType;
          if (valueType === "boolean") {
            return target.checked ? "true" : "false";
          }
          return target.value;
        }

        function collectEnumOptions(schema, currentValue) {
          const options = Array.isArray(schema?.options) ? [...schema.options] : [];
          const normalized = String(currentValue ?? "");
          if (normalized && !options.includes(normalized)) {
            options.push(normalized);
          }
          if (!options.length && schema?.defaultValue) {
            options.push(schema.defaultValue);
          }
          return options;
        }

        function renderStructureInput(scope, key, value, options = {}) {
          const schema = structureAttributeSchemas[scope]?.[key];
          const classAttr = options.className ? ` class="${options.className}"` : "";
          const datasetAttrs = buildDatasetAttributes(options.dataset || {});
          const datasetText = datasetAttrs ? ` ${datasetAttrs}` : "";
          if (!schema) {
            return `<input type="text"${classAttr}${datasetText} value="${escapeHtml(value ?? "")}" />`;
          }
          const inputValue = value ?? schema.defaultValue ?? "";
          switch (schema.type) {
            case "number": {
              const minAttr = typeof schema.min === "number" ? ` min="${schema.min}"` : "";
              const maxAttr = typeof schema.max === "number" ? ` max="${schema.max}"` : "";
              const stepAttr = ` step="${schema.step ?? 1}"`;
              const readOnlyAttr = schema.readOnly ? " readonly" : "";
              return `<input type="number"${classAttr}${datasetText} data-value-type="number"${minAttr}${maxAttr}${stepAttr}${readOnlyAttr} value="${escapeHtml(inputValue)}" />`;
            }
            case "boolean": {
              const checkedAttr = isTrueValue(inputValue) ? " checked" : "";
              const disabledAttr = schema.readOnly ? " disabled" : "";
              const labelText = schema.checkboxLabel || "Enabled";
              return `<label class="structure-checkbox"><input type="checkbox"${classAttr}${datasetText} data-value-type="boolean"${checkedAttr}${disabledAttr} /><span>${escapeHtml(labelText)}</span></label>`;
            }
            case "enum": {
              const enumOptions = collectEnumOptions(schema, inputValue);
              if (!enumOptions.length) {
                return `<input type="text"${classAttr}${datasetText} value="${escapeHtml(inputValue)}" />`;
              }
              const groupName = options.name || `${scope}-${key}-${options.groupIndex ?? 0}`;
              const disabledAttr = schema.readOnly ? " disabled" : "";
              const normalizedValue = inputValue || schema.defaultValue || enumOptions[0];
              const radios = enumOptions
                .map((option) => {
                  const isChecked = option === normalizedValue;
                  return `<label class="toggle-radio-option"><input type="radio"${classAttr}${datasetText} name="${escapeHtml(
                    groupName
                  )}" data-value-type="enum" value="${escapeHtml(option)}"${isChecked ? " checked" : ""}${disabledAttr} /><span>${escapeHtml(option)}</span></label>`;
                })
                .join("");
              return `<div class="toggle-group">${radios}</div>`;
            }
            default:
              return `<input type="text"${classAttr}${datasetText} value="${escapeHtml(inputValue)}" />`;
          }
        }
        function generateLatin9Key() {
          const randomDigits = (length) =>
            String(Math.floor(Math.random() * Math.pow(10, length))).padStart(length, "0");
          return `_FSN${randomDigits(3)}_${randomDigits(4)}`;
        }
        function defaultFieldsetName() {
          return `Fieldset ${fieldsets.length + 1}`;
        }
        function cloneAttributes(source = {}) {
          return { ...(source || {}) };
        }
        const plotNode = document.getElementById("plot");
        const statusText = document.getElementById("status-text");
        const fileInput = document.getElementById("file-input");
        const svgFileInput = document.getElementById("svg-file-input");
        const plotWrapper = document.querySelector(".plot-wrapper");
        const scanPlanesContainer = document.getElementById("scanplanes-editor");
        const addScanPlaneBtn = document.getElementById("btn-add-scanplane");
        const fieldsetsContainer = document.getElementById("fieldsets-editor");
        const fieldsetDevicesContainer = document.getElementById("fieldset-devices");
        const addFieldsetDeviceBtn = document.getElementById("btn-add-fieldset-device");
        const fieldsetGlobalContainer = document.getElementById("fieldset-global");
        const addFieldsetBtn = document.getElementById("btn-add-fieldset");
        const casetableConfigurationContainer = document.getElementById("casetable-configuration");
        const casetableFieldsConfigurationContainer = document.getElementById(
          "casetable-fields-configuration"
        );
        const casetableCasesContainer = document.getElementById("casetable-cases");
        const casetableCaseCountLabel = document.getElementById("casetable-case-count");
        const addCasetableCaseBtn = document.getElementById("btn-add-case");
        const casetableEvalsContainer = document.getElementById("casetable-evals");
        const casetableEvalCountLabel = document.getElementById("casetable-eval-count");
        const addCasetableEvalBtn = document.getElementById("btn-add-eval");
        const casetableEvalsWarning = document.getElementById("casetable-evals-warning");
        const globalMultipleSamplingInput = document.getElementById("global-multiple-sampling");
        const caseCheckboxes = document.getElementById("case-checkboxes");
        if (caseCheckboxes) {
          caseCheckboxes.classList.add("toggle-pill-grid");
        }
        const fieldsetCheckboxes = document.getElementById("fieldset-checkboxes");
        if (fieldsetCheckboxes) {
          fieldsetCheckboxes.classList.add("toggle-pill-grid");
        }
        const caseCheckAllBtn = document.getElementById("btn-case-check-all");
        const caseUncheckAllBtn = document.getElementById("btn-case-uncheck-all");
        const caseDeleteVisibleBtn = document.getElementById("btn-case-delete-visible");
        const checkAllBtn = document.getElementById("btn-fieldset-check-all");
        const uncheckAllBtn = document.getElementById("btn-fieldset-uncheck-all");
        const fieldDeleteVisibleBtn = document.getElementById("btn-field-delete-visible");
        const toggleLegendBtn = document.getElementById("btn-toggle-legend");
        const fieldOfViewInput = document.getElementById("triorb-field-of-view");
        const globalResolutionInput = document.getElementById("global-resolution");
        const globalTolerancePositiveInput = document.getElementById("global-tolerance-positive");
        const globalToleranceNegativeInput = document.getElementById("global-tolerance-negative");
        const triorbShapesContainer = document.getElementById("triorb-shapes-list");
        const addTriOrbShapeBtn = document.getElementById("btn-add-triorb-shape");
        const triorbShapeCheckboxes = document.getElementById("triorb-shape-checkboxes");
        if (triorbShapeCheckboxes) {
          triorbShapeCheckboxes.classList.add("toggle-pill-grid");
        }
        const triorbShapeCheckAllBtn = document.getElementById("btn-triorb-shape-check-all");
        const triorbShapeUncheckAllBtn = document.getElementById("btn-triorb-shape-uncheck-all");
        const triorbShapeDeleteVisibleBtn = document.getElementById(
          "btn-triorb-shape-delete-visible"
        );
        const overlayShapeBtn = document.getElementById("btn-add-shape-overlay");
        const overlayFieldBtn = document.getElementById("btn-add-field-overlay");
        const replicateFieldBtn = document.getElementById("btn-replicate-field");
        let globalMultipleSampling = "2";
        const initialTriOrbShapes = bootstrapData.triorbShapes || [];
        const shapeModal = document.getElementById("shape-modal");
        const shapeModalBody = document.getElementById("shape-modal-body");
        const shapeModalTitle = document.getElementById("shape-modal-title");
        const shapeModalSave = document.getElementById("shape-modal-save");
        const shapeModalCancel = document.getElementById("shape-modal-cancel");
        const shapeModalClose = document.getElementById("shape-modal-close");
        const shapeModalWindow = document.querySelector("#shape-modal .modal-window");
        const shapeModalHeader = shapeModalWindow?.querySelector(".modal-header");
        const createShapeModal = document.getElementById("create-shape-modal");
        const createShapeModalWindow = document.querySelector("#create-shape-modal .modal-window");
        const createShapeModalClose = document.getElementById("create-shape-modal-close");
        const createShapeModalCancel = document.getElementById("create-shape-modal-cancel");
        const createShapeModalHeader = createShapeModalWindow?.querySelector(".modal-header");
        const createShapeModalTitle = createShapeModalWindow?.querySelector(".modal-title");
        const createShapeModalSave = document.getElementById("create-shape-modal-save");
        const createShapeModalDelete = document.getElementById("create-shape-modal-delete");
        const createShapeNameInput = document.getElementById("create-shape-name");
        const createShapeFieldtypeSelect = document.getElementById("create-shape-fieldtype");
        const createShapeTypeSelect = document.getElementById("create-shape-type");
        const createShapeKindSelect = document.getElementById("create-shape-kind");
        const createShapePointsInput = document.getElementById("create-shape-points");
        const createShapePolygonGroup = document.querySelector(".shape-polygon-group");
        const createShapeRectFields = document.querySelector(".shape-rectangle-group");
        const createShapeCircleFields = document.querySelector(".shape-circle-group");
        const createShapeFieldsetList = document.getElementById("create-shape-fieldset-list");
        const createFieldModal = document.getElementById("create-field-modal");
        const createFieldModalWindow = document.querySelector("#create-field-modal .modal-window");
        const createFieldModalClose = document.getElementById("create-field-modal-close");
        const createFieldModalCancel = document.getElementById("create-field-modal-cancel");
        const createFieldModalTitle = createFieldModalWindow?.querySelector(".modal-title");
        const createFieldModalSave = document.getElementById("create-field-modal-save");
        const createFieldModalHeader = createFieldModalWindow?.querySelector(".modal-header");
        const createFieldModalBody = createFieldModalWindow?.querySelector(".modal-body");
        const replicateModal = document.getElementById("replicate-modal");
        const replicateModalWindow = document.querySelector("#replicate-modal .modal-window");
        const replicateModalClose = document.getElementById("replicate-modal-close");
        const replicateModalCancel = document.getElementById("replicate-modal-cancel");
        const replicateModalApply = document.getElementById("replicate-modal-apply");
        const replicateModalHeader = replicateModalWindow?.querySelector(".modal-header");
        const replicateModalBody = replicateModalWindow?.querySelector(".modal-body");
        const bulkEditModalWindow = document.querySelector("#bulk-edit-modal .modal-window");
        const bulkEditModalHeader = bulkEditModalWindow?.querySelector(".modal-header");
        const bulkEditBtn = document.getElementById("btn-bulk-edit");
        const bulkEditModal = document.getElementById("bulk-edit-modal");
        const bulkEditModalClose = document.getElementById("bulk-edit-modal-close");
        const bulkEditModalCancel = document.getElementById("bulk-edit-modal-cancel");
        const bulkEditModalApply = document.getElementById("bulk-edit-modal-apply");
        const bulkEditCaseToggles = document.getElementById("bulk-edit-case-toggles");
        const bulkEditShapeToggles = document.getElementById("bulk-edit-shape-toggles");
        const bulkStaticNumberInput = document.getElementById("bulk-static-number");
        const bulkStaticValueSelect = document.getElementById("bulk-static-value");
        const bulkShapeOutsetInput = document.getElementById("bulk-shape-outset");
        const bulkShapeMoveXInput = document.getElementById("bulk-shape-move-x");
        const bulkShapeMoveYInput = document.getElementById("bulk-shape-move-y");
        const svgImportModal = document.getElementById("svg-import-modal");
        const svgImportDuplicateList = document.getElementById("svg-import-duplicate-list");
        const svgImportApplyBtn = document.getElementById("svg-import-apply");
        const svgImportCancelBtn = document.getElementById("svg-import-cancel");
        const svgImportCloseBtn = document.getElementById("svg-import-close");
        const createFieldsetNameInput = document.getElementById("create-field-fieldset-name");
        const createFieldsetLatinInput = document.getElementById("create-field-fieldset-latin9");
        const createFieldNameInputs = [
          document.getElementById("create-field-name-0"),
          document.getElementById("create-field-name-1"),
        ];
        const createFieldTypeSelects = [
          document.getElementById("create-field-type-0"),
          document.getElementById("create-field-type-1"),
        ];
        const shapeKinds = ["Field", "CutOut"];
        const createFieldShapeLists = [
          {
            Field: document.getElementById("create-field-shape-list-0-field"),
            CutOut: document.getElementById("create-field-shape-list-0-cutout"),
          },
          {
            Field: document.getElementById("create-field-shape-list-1-field"),
            CutOut: document.getElementById("create-field-shape-list-1-cutout"),
          },
        ];
        const createFieldModalFieldShapeSelections = createFieldShapeLists.map(() =>
          shapeKinds.reduce((acc, kind) => {
            acc[kind] = new Set();
            return acc;
          }, {})
        );
        const replicateFieldsetSelect = document.getElementById("replicate-fieldset-select");
        const replicateCopyCountInput = document.getElementById("replicate-copy-count");
        const replicateOffsetXInput = document.getElementById("replicate-offset-x");
        const replicateOffsetYInput = document.getElementById("replicate-offset-y");
        const replicateRotationInput = document.getElementById("replicate-rotation");
        const replicateRotationOriginXInput = document.getElementById("replicate-rotation-origin-x");
        const replicateRotationOriginYInput = document.getElementById("replicate-rotation-origin-y");
        const replicateEllipseRatioInput = document.getElementById("replicate-ellipse-ratio");
        const replicateWidthSineGainInput = document.getElementById("replicate-width-sine-gain");
        const replicateHeightSineGainInput = document.getElementById("replicate-height-sine-gain");
        const replicateScalePercentInput = document.getElementById("replicate-scale-percent");
        const replicateIncludeCutoutsInput = document.getElementById("replicate-include-cutouts");
        const replicatePreserveOrientationInput = document.getElementById(
          "replicate-preserve-orientation"
        );
        const replicateStaticInputsAutoInput = document.getElementById("replicate-static-inputs-auto");
        const replicateIncludePreviousFieldsInput = document.getElementById(
          "replicate-include-previous-fieldset-fields"
        );
        const replicateSpeedMinStepInput = document.getElementById("replicate-speed-min-step");
        const replicateSpeedMaxStepInput = document.getElementById("replicate-speed-max-step");
        const replicateCasePrefixInput = document.getElementById("replicate-case-prefix");
        const replicateTargetToggle = document.getElementById("replicate-target-toggle");
        const replicateCaseSelect = document.getElementById("replicate-case-select");
        const fieldTypeLabels = ["ProtectiveSafeBlanking", "WarningSafeBlanking"];
        const defaultFieldNames = ["Protective", "Warning"];
        const createRectOriginXInput = document.getElementById("create-rect-originx");
        const createRectOriginYInput = document.getElementById("create-rect-originy");
        const createRectWidthInput = document.getElementById("create-rect-width");
        const createRectHeightInput = document.getElementById("create-rect-height");
        const createRectRotationInput = document.getElementById("create-rect-rotation");
        const createCircleCenterXInput = document.getElementById("create-circle-centerx");
        const createCircleCenterYInput = document.getElementById("create-circle-centery");
        const createCircleRadiusInput = document.getElementById("create-circle-radius");
        const saveTriOrbBtn = document.getElementById("btn-save-triorb");
        const saveSickBtn = document.getElementById("btn-save-sick");
        const newPlotBtn = document.getElementById("btn-new");
        const originTrace = findOriginTrace(defaultFigure);

        let currentFigure = cloneFigure(defaultFigure);
        let scanPlanes = initializeScanPlanes(initialScanPlanes);
        let triorbShapes = initializeTriOrbShapes(initialTriOrbShapes);
        let triOrbImportContext = { triOrbRootFound: true };
        const triOrbShapeRegistry = new Map();
        const triOrbShapeLookup = new Map();
        const triOrbShapeIndexLookup = new Map();
        const triOrbShapeCardCache = new Map();
        let triOrbShapesListInitialized = false;
        let pendingSvgImportContext = null;
        let triorbSource = bootstrapData.triorbSource || "";
        let fieldsets = initializeFieldsets(initialFieldsets);
        let fieldsetDevices = initializeFieldsetDevices(initialFieldsetDevices);
        let fieldsetGlobalGeometry = initializeGlobalGeometry(initialFieldsetGlobal);
        const casetableCasesLimit = 128;
        const casetableEvalsLimit = 5;
        const casetableConfigurationStaticInputsCount = 8;
        const casetableConfigurationSpecialTags = new Set([
          "Name",
          "StaticInputs",
          "UseSpeed",
          "InputDelay",
          "CaseSequenceEnabled",
          "ShowPermanentPreset",
        ]);
        let casetableAttributes = cloneAttributes(
          casetablePayload?.casetable_attributes || { Index: "0" }
        );
        let casetableConfiguration = normalizeCasetableConfiguration(
          casetablePayload?.configuration
        );
        let casetableCases = initializeCasetableCases(casetablePayload?.cases);
        let casetableLayout = normalizeCasetableLayout(casetablePayload?.layout);
        const evalUserFieldFallbackLabels = [
          "Preset Field 1",
          "Preset Field 2",
          "Preset Field 3",
        ];
        const statFieldDefinitions = [
          { tag: "PermRed", id: "59", label: "PermRed" },
          { tag: "PermGreen", id: "60", label: "PermGreen" },
          { tag: "PermGreenWf", id: "61", label: "PermGreenWf" },
        ];
        let casetableEvals = normalizeCasetableEvals(
          casetablePayload?.evals,
          casetableCases.length
        );
        let casetableFieldsConfiguration = null;
        let caseToggleStates = casetableCases.map(() => false);
        let caseFieldAssignments = [];
        globalMultipleSampling = deriveInitialMultipleSampling(fieldsets);
        let legendVisible = true;
        let fieldOfViewDegrees = parseNumeric(fieldOfViewInput?.value, 270);
        const debugMode = Boolean(new URLSearchParams(window.location.search).get("debug"));
        if (debugMode) {
          document.body.classList.add("debug-mode");
        }
        let globalResolution = parseNumeric(globalResolutionInput?.value, 70);
        let globalTolerancePositive = parseNumeric(globalTolerancePositiveInput?.value, 0);
        let globalToleranceNegative = parseNumeric(globalToleranceNegativeInput?.value, 0);
        globalResolution = deriveFieldAttribute(fieldsets, "Resolution", globalResolution);
        globalTolerancePositive = deriveFieldAttribute(fieldsets, "TolerancePositive", globalTolerancePositive);
        globalToleranceNegative = deriveFieldAttribute(fieldsets, "ToleranceNegative", globalToleranceNegative);
        applyGlobalMultipleSampling(globalMultipleSampling, { rerender: false });
        if (globalMultipleSamplingInput) {
          globalMultipleSamplingInput.value = globalMultipleSampling;
        }
        if (globalResolutionInput) {
          globalResolutionInput.value = globalResolution;
        }
        if (globalTolerancePositiveInput) {
          globalTolerancePositiveInput.value = globalTolerancePositive;
        }
        if (globalToleranceNegativeInput) {
          globalToleranceNegativeInput.value = globalToleranceNegative;
        }
        let createShapePreview = null;
        let createShapeDraftId = null;
        let fieldModalPreview = null;
        updateGlobalFieldAttributes();

        let lastHoverPoint = null;
        let modalShapeMeta = null;
        let modalOriginalShape = null;
        let modalOffsetX = 0;
        let modalOffsetY = 0;
        let modalDragStartX = 0;
        let modalDragStartY = 0;
        let isModalDragging = false;
        let createShapeMode = "create";
        let createShapeEditingId = null;
        let createShapeOriginal = null;
        const replicateFormState = {
          target: "fieldset",
          fieldsetIndex: 0,
          selectedCaseIndexes: [0],
          copyCount: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          rotationOriginX: 0,
          rotationOriginY: 0,
          ellipseRatio: 1,
          widthSineGain: 0,
          heightSineGain: 0,
          scalePercent: 0,
          casePrefix: "",
          includeCutouts: false,
          preserveOrientation: false,
          autoStaticInputs: false,
          speedRangeMinStep: 0,
          speedRangeMaxStep: 0,
          includePreviousFields: false,
        };
        const bulkEditState = {
          selectedCases: new Set(),
          selectedShapes: new Set(),
          lastCaseIndex: null,
          lastShapeIndex: null,
        };
        let replicatePreviewState = null;
        const plotTraceCache = {
          baseFigure: { version: -1, traces: [] },
          deviceOverlay: { version: -1, traces: [] },
          triOrbShapes: { version: -1, traces: [] },
          fieldsets: { version: -1, traces: [] },
        };
        let baseFigureVersion = 0;
        let deviceOverlayVersion = 0;
        let triOrbShapeTraceVersion = 0;
        let fieldsetTraceVersion = 0;
        invalidateBaseFigureTraces();

        rebuildTriOrbShapeRegistry();
        renderScanPlanes();
        renderFieldsets();
        renderFieldsetDevices();
        renderFieldsetGlobal();
        renderFieldsetCheckboxes();
        renderTriOrbShapes();
        renderTriOrbShapeCheckboxes();
        renderCasetableConfiguration();
        renderCasetableCases();
        renderCasetableFieldsConfiguration();

        function initializeScanPlanes(data) {
          let planes;
          if (!Array.isArray(data) || !data.length) {
            planes = [createDefaultScanPlane(0)];
          } else {
            planes = data.map((plane, index) => ({
              attributes: { ...(plane.attributes || {}), Index: plane.attributes?.Index ?? String(index) },
              devices: Array.isArray(plane.devices)
                ? plane.devices.map((device, dIdx) => ({
                    attributes: { ...(device.attributes || {}), Index: device.attributes?.Index ?? String(dIdx) },
                  }))
                : [],
            }));
          }
          planes.forEach(ensureDefaultScanDevices);
          return planes;
        }

        function cloneFigure(figure) {
          return JSON.parse(JSON.stringify(figure));
        }

        function setStatus(message, state = "ok") {
          statusText.textContent = message;
          const resolvedState =
            typeof state === "string" ? state : state ? "error" : "ok";
          statusText.dataset.state = resolvedState;
        }

        function invalidateBaseFigureTraces() {
          baseFigureVersion += 1;
        }

        function invalidateDeviceTraceCache() {
          deviceOverlayVersion += 1;
        }

        function invalidateFieldsetTraces({ skipDeviceCache = false } = {}) {
          fieldsetTraceVersion += 1;
          if (!skipDeviceCache) {
            invalidateDeviceTraceCache();
          }
        }

        function invalidateTriOrbShapeCaches() {
          triOrbShapeTraceVersion += 1;
          invalidateFieldsetTraces({ skipDeviceCache: true });
        }

        function buildBaseFigureTraces() {
          return (currentFigure.data || []).map((trace, index) => {
            const copy = { ...trace };
            const originalName = copy.name || `Trace ${index + 1}`;
            copy.name = formatLegendLabel(originalName);
            return copy;
          });
        }

        function resolveBaseFigureTraces() {
          if (plotTraceCache.baseFigure.version === baseFigureVersion) {
            return plotTraceCache.baseFigure.traces;
          }
          const traces = buildBaseFigureTraces();
          plotTraceCache.baseFigure = { version: baseFigureVersion, traces };
          return traces;
        }

        function resolveDeviceOverlayTraces() {
          if (plotTraceCache.deviceOverlay.version === deviceOverlayVersion) {
            return plotTraceCache.deviceOverlay.traces;
          }
          const traces = buildDeviceOverlayTraces();
          plotTraceCache.deviceOverlay = { version: deviceOverlayVersion, traces };
          return traces;
        }

        function resolveTriOrbShapeTraces() {
          if (plotTraceCache.triOrbShapes.version === triOrbShapeTraceVersion) {
            return plotTraceCache.triOrbShapes.traces;
          }
          const traces = buildTriOrbShapeTraces();
          plotTraceCache.triOrbShapes = { version: triOrbShapeTraceVersion, traces };
          return traces;
        }

        function resolveFieldsetTraces() {
          if (plotTraceCache.fieldsets.version === fieldsetTraceVersion) {
            return plotTraceCache.fieldsets.traces;
          }
          const traces = buildFieldsetTraces();
          plotTraceCache.fieldsets = { version: fieldsetTraceVersion, traces };
          return traces;
        }

        function renderFigure() {
          syncPlotSize();
          const baseData = resolveBaseFigureTraces();
          const deviceTraces = resolveDeviceOverlayTraces();
          const triOrbShapeTraces = resolveTriOrbShapeTraces();
          const fieldsetTraces = resolveFieldsetTraces();
          const previewTraces = buildCreateShapePreviewTraces();
          const fieldModalPreviewTraces = buildFieldModalPreviewTraces();
          const replicatePreviewTraces = buildReplicatePreviewTraces();
          const bulkEditPreviewTraces = buildBulkEditPreviewTraces();
          const layout = {
            ...(currentFigure.layout || {}),
            uirevision: `${baseFigureVersion}:${triOrbShapeTraceVersion}:${fieldsetTraceVersion}:${deviceOverlayVersion}`,
            showlegend: legendVisible,
            legend: {
              ...(currentFigure.layout?.legend || {}),
              x: 0,
              y: 1,
              xanchor: "left",
              yanchor: "top",
              orientation: "v",
              bgcolor: "rgba(255, 255, 255, 0.88)",
              borderwidth: 0,
              font: {
                ...(currentFigure.layout?.legend?.font || {}),
                size: 11,
                color: "#0f172a",
              },
            },
            xaxis: {
              ...(currentFigure.layout?.xaxis || {}),
              title: "",
            },
            yaxis: {
              ...(currentFigure.layout?.yaxis || {}),
              title: "",
            },
          };
          const combinedTraces = [];
          if (deviceTraces.length) {
            combinedTraces.push(...deviceTraces);
          }
          if (triOrbShapeTraces.length) {
            combinedTraces.push(...triOrbShapeTraces);
          }
          if (baseData.length) {
            combinedTraces.push(...baseData);
          }
          if (fieldsetTraces.length) {
            combinedTraces.push(...fieldsetTraces);
          }
          if (previewTraces.length) {
            combinedTraces.push(...previewTraces);
          }
          if (fieldModalPreviewTraces.length) {
            combinedTraces.push(...fieldModalPreviewTraces);
          }
          if (replicatePreviewTraces.length) {
            combinedTraces.push(...replicatePreviewTraces);
          }
          if (bulkEditPreviewTraces.length) {
            combinedTraces.push(...bulkEditPreviewTraces);
          }
          Plotly.react(plotNode, combinedTraces, layout, figureConfig);
        }

        function buildFieldsetTraces() {
          if (!Array.isArray(fieldsets) || !fieldsets.length) {
            return [];
          }
          const traces = [];
          fieldsets.forEach((fieldset, fieldsetIndex) => {
            if (!fieldset || fieldset.visible === false) {
              return;
            }
            const fieldsetName =
              fieldset.attributes?.Name || `Fieldset ${fieldsetIndex + 1}`;
            (fieldset.fields || []).forEach((field, fieldIndex) => {
              const fieldName =
                field.attributes?.Name || `Field ${fieldIndex + 1}`;
              const labelPrefix = `${fieldsetName} / ${fieldName}`;
              const fieldType = field.attributes?.Fieldtype || "ProtectiveSafeBlanking";
              (field.shapeRefs || []).forEach((shapeRef, shapeRefIndex) => {
                const shape = findTriOrbShapeById(shapeRef?.shapeId);
                if (!shape) {
                  return;
                }
                const shapeIndex = getTriOrbShapeIndexById(shape.id);
                const shapeLabel = `${labelPrefix} / ${shape.name || shape.type}`;
                const colorSeed = `${shape.id || shapeRefIndex}:${fieldsetIndex}:${fieldIndex}:${shapeRefIndex}`;
                const color = pickFieldColor(fieldType, colorSeed);
                let shapeTrace = null;
                switch (shape.type) {
                  case "Rectangle":
                    if (shape.rectangle) {
                      shapeTrace = buildRectangleTrace(
                        shape.rectangle,
                        color,
                        shapeLabel,
                        fieldType,
                        fieldsetIndex,
                        fieldIndex,
                        shapeRefIndex
                      );
                    }
                    break;
                  case "Circle":
                    if (shape.circle) {
                      shapeTrace = buildCircleTrace(
                        shape.circle,
                        color,
                        shapeLabel,
                        fieldType,
                        fieldsetIndex,
                        fieldIndex,
                        shapeRefIndex
                      );
                    }
                    break;
                  case "Polygon":
                  default:
                    if (shape.polygon) {
                      shapeTrace = buildPolygonTrace(
                        shape.polygon,
                        color,
                        shapeLabel,
                        fieldType,
                        fieldsetIndex,
                        fieldIndex,
                        shapeRefIndex
                      );
                    }
                    break;
                }
                if (shapeTrace) {
                  shapeTrace.name = formatLegendLabel(shapeLabel);
                  shapeTrace.meta = {
                    ...shapeTrace.meta,
                    isTriOrbShape: true,
                    shapeId: shape.id,
                    shapeIndex,
                    shapeType: shape.type,
                  };
                  traces.push(shapeTrace);
                }
              });
            });
          });
          return traces;
        }

        function buildCreateShapePreviewTraces() {
          if (!createShapePreview) {
            return [];
          }
          const preview = createShapePreview;
          let previewTrace = null;
          const previewLabel = `${preview.name || "New Shape"} (preview)`;
          const previewColorSet = {
            stroke: "rgba(239, 68, 68, 0.9)",
            fill: withAlpha("#ef4444", 0.08),
          };
          switch (preview.type) {
            case "Rectangle":
              previewTrace = buildRectangleTrace(
                preview.rectangle,
                previewColorSet,
                previewLabel,
                preview.fieldtype || "ProtectiveSafeBlanking",
                0,
                0,
                0
              );
              break;
            case "Circle":
              previewTrace = buildCircleTrace(
                preview.circle,
                previewColorSet,
                previewLabel,
                preview.fieldtype || "ProtectiveSafeBlanking",
                0,
                0,
                0
              );
              break;
            case "Polygon":
            default:
              previewTrace = buildPolygonTrace(
                preview.polygon,
                previewColorSet,
                previewLabel,
                preview.fieldtype || "ProtectiveSafeBlanking",
                0,
                0,
                0
              );
              break;
          }
          if (!previewTrace) {
            return [];
          }
          previewTrace.line = {
            ...(previewTrace.line || {}),
            color: previewColorSet.stroke,
            width: Math.max((previewTrace.line && previewTrace.line.width) || 2, 3),
            dash: "solid",
          };
          previewTrace.fillcolor = previewColorSet.fill;
          previewTrace.name = previewLabel;
          previewTrace.showlegend = false;
          previewTrace.hovertemplate = `<b>Preview:</b> ${escapeHtml(
            preview.name || "Shape"
          )}<extra></extra>`;
          previewTrace.meta = { ...(previewTrace.meta || {}), preview: true };
          return [previewTrace];
        }

        function cloneTriOrbShape(shape) {
          return shape ? JSON.parse(JSON.stringify(shape)) : null;
        }

          function resolveBulkShapeTransform() {
            const delta = parseNumeric(bulkShapeOutsetInput?.value, 0) || 0;
            const moveX = parseNumeric(bulkShapeMoveXInput?.value, 0) || 0;
            const moveY = parseNumeric(bulkShapeMoveYInput?.value, 0) || 0;
            return {
              delta,
              offsetX: moveX,
              offsetY: moveY,
            };
          }

        function buildBulkShapePreviewTrace(shape, colorSet, label, options = {}) {
          if (!shape) {
            return null;
          }
          let trace = null;
          switch (shape.type) {
            case "Rectangle":
              if (shape.rectangle) {
                trace = buildRectangleTrace(
                  shape.rectangle,
                  colorSet,
                  label,
                  shape.fieldtype || "ProtectiveSafeBlanking",
                  0,
                  0,
                  0
                );
              }
              break;
            case "Circle":
              if (shape.circle) {
                trace = buildCircleTrace(
                  shape.circle,
                  colorSet,
                  label,
                  shape.fieldtype || "ProtectiveSafeBlanking",
                  0,
                  0,
                  0
                );
              }
              break;
            case "Polygon":
            default:
              if (shape.polygon) {
                trace = buildPolygonTrace(
                  shape.polygon,
                  colorSet,
                  label,
                  shape.fieldtype || "ProtectiveSafeBlanking",
                  0,
                  0,
                  0
                );
              }
              break;
          }
          if (!trace) {
            return null;
          }
          const lineWidth = Math.max((trace.line && trace.line.width) || 2, options.minLineWidth || 3);
          trace.line = {
            ...(trace.line || {}),
            color: colorSet.stroke,
            width: lineWidth,
            dash: options.lineDash || "solid",
          };
          trace.fillcolor = colorSet.fill;
          trace.name = label;
          trace.showlegend = false;
          trace.hovertemplate = `<b>${escapeHtml(label)}</b><extra></extra>`;
          trace.meta = { ...(trace.meta || {}), bulkEditPreview: true };
          return trace;
        }

        function buildBulkEditPreviewTraces() {
          if (!bulkEditState.selectedShapes.size) {
            return [];
          }
          syncBulkEditSelections();
          const { delta, offsetX, offsetY } = resolveBulkShapeTransform();
          const colorSets = {
            selected: {
              stroke: "rgba(14, 165, 233, 0.9)",
              fill: withAlpha("#0ea5e9", 0.12),
            },
            preview: {
              stroke: "rgba(239, 68, 68, 0.95)",
              fill: withAlpha("#ef4444", 0.08),
            },
          };
          const traces = [];
          bulkEditState.selectedShapes.forEach((shapeIndex) => {
            const shape = triorbShapes[shapeIndex];
            if (!shape) {
              return;
            }
            const labelBase = shape.name || `Shape ${shapeIndex + 1}`;
            const selectedTrace = buildBulkShapePreviewTrace(
              shape,
              colorSets.selected,
              `${labelBase} (選択中)`,
              { lineDash: "dot" }
            );
            if (selectedTrace) {
              traces.push(selectedTrace);
            }
            const previewShape = cloneTriOrbShape(shape);
            let previewChanged = false;
            if (delta !== 0) {
              previewChanged = applyShapeInsetOutset(previewShape, delta) || previewChanged;
            }
            if (offsetX || offsetY) {
              applyReplicationTransform(previewShape, { offsetX, offsetY });
              previewChanged = true;
            }
            if (previewChanged) {
              const previewTrace = buildBulkShapePreviewTrace(
                previewShape,
                colorSets.preview,
                `${labelBase} (適用後プレビュー)`,
                { minLineWidth: 4 }
              );
              if (previewTrace) {
                traces.push(previewTrace);
              }
            }
          });
          return traces;
        }

function buildPolygonTrace(polygon, colorSet, label, fieldType, fieldsetIndex, fieldIndex, polygonIndex) {
          const points = Array.isArray(polygon?.points) ? polygon.points : [];
          if (points.length < 2) {
            return null;
          }
          const coords = points.map((point) => ({
            x: parseNumeric(point.X, 0),
            y: parseNumeric(point.Y, 0),
          }));
          if (!coords.length) {
            return null;
          }
          const x = coords.map((point) => point.x);
          const y = coords.map((point) => point.y);
          const first = coords[0];
          const last = coords[coords.length - 1];
          if (first.x !== last.x || first.y !== last.y) {
            x.push(first.x);
            y.push(first.y);
          } else {
            x.push(first.x);
            y.push(first.y);
          }
          const truncatedLabel = formatLegendLabel(label);
          const polygonType = getPolygonTypeValue(polygon);
          const style = resolveShapeStyle(fieldType, polygonType);
          return {
            type: "scatter",
            mode: "lines",
            line: { color: colorSet.stroke, width: style.lineWidth, dash: style.lineDash },
            fill: "toself",
            fillcolor: colorSet.fill,
            name: truncatedLabel,
            meta: {
              fullLabel: label,
              kind: "polygon",
              fieldsetIndex,
              fieldIndex,
              shapeIndex: polygonIndex,
              shapeType: polygonType || "Field",
            },
            hovertemplate: "<b>%{meta.fullLabel}</b><extra></extra>",
            x,
            y,
          };
}

function buildRectangleTrace(rectangle, colorSet, label, fieldType, fieldsetIndex, fieldIndex, rectangleIndex) {
          const corners = getRectangleCornerPoints(rectangle);
          if (!corners || !corners.length) {
            return null;
          }
          const rotated = corners.concat(corners[0]);
          const truncatedLabel = formatLegendLabel(label);
          const style = resolveShapeStyle(fieldType, rectangle?.Type);
          return {
            type: "scatter",
            mode: "lines",
            line: { color: colorSet.stroke, width: style.lineWidth, dash: style.lineDash },
            fill: "toself",
            fillcolor: colorSet.fill,
            name: truncatedLabel,
            meta: {
              fullLabel: label,
              kind: "rectangle",
              fieldsetIndex,
              fieldIndex,
              shapeIndex: rectangleIndex,
              shapeType: rectangle?.Type || "Field",
            },
            hovertemplate: "<b>%{meta.fullLabel}</b><extra></extra>",
            x: rotated.map((point) => point.x),
            y: rotated.map((point) => point.y),
          };
}

function buildCircleTrace(circle, colorSet, label, fieldType, fieldsetIndex, fieldIndex, circleIndex) {
          if (!circle) {
            return null;
          }
          const radius = parseNumeric(circle.Radius, NaN);
          if (!Number.isFinite(radius) || radius <= 0) {
            return null;
          }
          const centerX = parseNumeric(circle.CenterX, 0);
          const centerY = parseNumeric(circle.CenterY, 0);
          const x = [];
          const y = [];
          for (let i = 0; i <= circleSampleSegments; i += 1) {
            const angle = (i / circleSampleSegments) * Math.PI * 2;
            x.push(centerX + radius * Math.cos(angle));
            y.push(centerY + radius * Math.sin(angle));
          }
          const truncatedLabel = formatLegendLabel(label);
          const style = resolveShapeStyle(fieldType, circle?.Type);
          return {
            type: "scatter",
            mode: "lines",
            line: { color: colorSet.stroke, width: style.lineWidth, dash: style.lineDash },
            fill: "toself",
            fillcolor: colorSet.fill,
            name: truncatedLabel,
            meta: {
              fullLabel: label,
              kind: "circle",
              fieldsetIndex,
              fieldIndex,
              shapeIndex: circleIndex,
              shapeType: circle?.Type || "Field",
            },
            hovertemplate: "<b>%{meta.fullLabel}</b><extra></extra>",
            x,
            y,
          };
        }


        function calculateVisibleFieldsetRadius() {
          let maxDistance = 0;
          fieldsets.forEach((fieldset) => {
            if (fieldset.visible === false) {
              return;
            }
            (fieldset.fields || []).forEach((field) => {
              (field.polygons || []).forEach((polygon) => {
                (polygon.points || []).forEach((point) => {
                  const x = parseNumeric(point.X, 0);
                  const y = parseNumeric(point.Y, 0);
                  const dist = Math.hypot(x, y);
                  if (dist > maxDistance) {
                    maxDistance = dist;
                  }
                });
              });
              (field.rectangles || []).forEach((rectangle) => {
                const corners = getRectangleCornerPoints(rectangle) || [];
                corners.forEach((corner) => {
                  const dist = Math.hypot(corner.x, corner.y);
                  if (dist > maxDistance) {
                    maxDistance = dist;
                  }
                });
              });
              (field.circles || []).forEach((circle) => {
                const centerX = parseNumeric(circle.CenterX, 0);
                const centerY = parseNumeric(circle.CenterY, 0);
                const radius = Math.max(0, parseNumeric(circle.Radius, 0));
                const dist = Math.hypot(centerX, centerY) + radius;
                if (dist > maxDistance) {
                  maxDistance = dist;
                }
              });
            });
          });
          return maxDistance;
        }

        function calculateDeviceFanRadius() {
          const visibleRadius = calculateVisibleFieldsetRadius();
          if (!Number.isFinite(visibleRadius) || visibleRadius <= 0) {
            return 1000;
          }
          return visibleRadius + 500;
        }

        function buildDeviceOverlayTraces() {
          if (!Array.isArray(fieldsetDevices) || !fieldsetDevices.length) {
            return [];
          }
          const radius = calculateDeviceFanRadius();
          console.debug("Device overlay state", {
            deviceCount: fieldsetDevices.length,
            fieldOfViewDegrees,
            radius,
          });
          const traces = [];
          fieldsetDevices.forEach((device, deviceIndex) => {
            const attrs = device?.attributes || {};
            const x = parseNumeric(attrs.PositionX, NaN);
            const y = parseNumeric(attrs.PositionY, NaN);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return;
            }
            const deviceLabel =
              attrs.Typekey ||
              attrs.DeviceName ||
              `Device ${deviceIndex + 1}`;
            traces.push({
              type: "scatter",
              mode: "markers",
              marker: { color: "#111", size: 8 },
              name: formatLegendLabel(`${deviceLabel} position`),
              meta: { fullLabel: deviceLabel },
              hovertemplate:
                "<b>%{meta.fullLabel}</b><br>X: %{x}<br>Y: %{y}<extra></extra>",
              x: [x],
              y: [y],
              showlegend: false,
            });
            const rotation = parseNumeric(attrs.Rotation, 0);
            if (
              Number.isFinite(radius) &&
              radius > 0 &&
              Number.isFinite(fieldOfViewDegrees) &&
              fieldOfViewDegrees > 0
            ) {
              const fanTrace = buildDeviceFanTrace(
                x,
                y,
                rotation,
                radius,
                fieldOfViewDegrees,
                deviceLabel
              );
              if (fanTrace) {
                traces.push(fanTrace);
              }
            }
          });
          return traces;
        }

        function buildTriOrbShapeTraces() {
          if (!Array.isArray(triorbShapes) || !triorbShapes.length) {
            return [];
          }
          return triorbShapes
            .map((shape, shapeIndex) => {
              if (shape.visible === false) {
                return null;
              }
              const color = pickTriOrbColor(shape.id || shapeIndex);
              const label = `${shape.name || `Shape ${shapeIndex + 1}`} (${shape.type})`;
              const fieldType = shape.fieldtype || "ProtectiveSafeBlanking";
              let shapeTrace = null;
              switch (shape.type) {
                case "Rectangle":
                  if (shape.rectangle) {
                    shapeTrace = buildRectangleTrace(
                      shape.rectangle,
                      color,
                      label,
                      fieldType,
                      0,
                      0,
                      shapeIndex
                    );
                  }
                  break;
                case "Circle":
                  if (shape.circle) {
                    shapeTrace = buildCircleTrace(
                      shape.circle,
                      color,
                      label,
                      fieldType,
                      0,
                      0,
                      shapeIndex
                    );
                  }
                  break;
                case "Polygon":
                default:
                  if (shape.polygon) {
                    shapeTrace = buildPolygonTrace(
                      shape.polygon,
                      color,
                      label,
                      fieldType,
                      0,
                      0,
                      shapeIndex
                    );
                  }
                  break;
              }
              if (!shapeTrace) {
                return null;
              }
              shapeTrace.meta = {
                ...(shapeTrace.meta || {}),
                isTriOrbShape: true,
                shapeId: shape.id,
                shapeIndex,
              };
              return shapeTrace;
            })
            .filter(Boolean);
        }

        function buildDeviceFanTrace(originX, originY, rotationDeg, radius, fovDeg, label) {
          if (
            !Number.isFinite(radius) ||
            radius <= 0 ||
            !Number.isFinite(fovDeg) ||
            fovDeg <= 0
          ) {
            return null;
          }
          const adjustedRotation = normalizeDegrees(rotationDeg + 90);
          const halfFov = fovDeg / 2;
          const start = degreesToRadians(adjustedRotation - halfFov);
          const end = degreesToRadians(adjustedRotation + halfFov);
          const steps = Math.max(6, Math.floor(fovDeg / 6));
          const points = [];
          points.push({ x: originX, y: originY });
          points.push({
            x: originX + radius * Math.cos(start),
            y: originY + radius * Math.sin(start),
          });
          for (let i = 1; i <= steps; i += 1) {
            const angle = start + ((end - start) * i) / steps;
            points.push({
              x: originX + radius * Math.cos(angle),
              y: originY + radius * Math.sin(angle),
            });
          }
          points.push({
            x: originX,
            y: originY,
          });
          return {
            type: "scatter",
            mode: "lines",
            line: { color: "#111", width: 1.2, dash: "dot" },
            fill: "toself",
            fillcolor: "rgba(17, 17, 17, 0.08)",
            name: formatLegendLabel(`${label} FOV`),
            meta: { fullLabel: `${label} Field of View` },
            hovertemplate: "<b>%{meta.fullLabel}</b><extra></extra>",
            x: points.map((point) => point.x),
            y: points.map((point) => point.y),
            showlegend: false,
          };
        }


        function formatLegendLabel(label) {
          const text = String(label ?? "").trim();
          if (!text) {
            return "Trace";
          }
          if (text.length <= legendLabelMaxLength) {
            return text;
          }
          return `${text.slice(0, legendLabelMaxLength - 3)}...`;
        }

        function resetFigure() {
          currentFigure = cloneFigure(defaultFigure);
          invalidateBaseFigureTraces();
          renderFigure();
          setStatus(`${updatedShape.name} を更新しました（${attached} 件の Fieldset に適用）`, "ok");

        }

        function createDefaultScanPlane(index = scanPlanes.length) {
          return {
            attributes: {
              Index: String(index),
              Name: `Monitoring plane ${index + 1}`,
              ScanPlaneDirection: "Horizontal",
              UseReferenceContour: "false",
              ObjectSize: "70",
              MultipleSampling: "2",
              MultipleSamplingOff2OnActivated: "false",
              SelectedCaseSwitching: "Fast",
            },
            devices: createDefaultScanPlaneDevices(),
          };
        }

        function createDefaultDevice(index = 0, overrides = {}) {
          return {
            attributes: {
              Index: String(index),
              DeviceName: overrides.DeviceName || `Device ${index + 1}`,
              Typekey: overrides.Typekey || "NANS3-CAAZ30ZA1P02",
              TypekeyVersion: overrides.TypekeyVersion || "1.0",
              TypekeyDisplayVersion: overrides.TypekeyDisplayVersion || "V 1.0.0",
              ResponseTime: overrides.ResponseTime || "30",
              ScanResolutionAddition: overrides.ScanResolutionAddition || "0",
            },
          };
        }

        function createDefaultScanPlaneDevices() {
          if (!defaultScanDeviceTemplates.length) {
            return [createDefaultDevice(0)];
          }
          return defaultScanDeviceTemplates.map((template, index) =>
            createDefaultDevice(index, template)
          );
        }

        function renderScanPlanes() {
          if (!scanPlanesContainer) return;
          scanPlanesContainer.innerHTML = scanPlanes
            .map((plane, planeIndex) => {
              const planeFields = Object.entries(plane.attributes || {})
                .map(([key, value]) => {
                  const control = renderStructureInput("scanPlane", key, value, {
                    className: "scanplane-attr",
                    dataset: { "plane-index": planeIndex, field: key },
                    name: `scanplane-${planeIndex}-${key}`,
                  });
                  return `
              <div class="scanplane-field">
                <label>${escapeHtml(key)}</label>
                ${control}
              </div>`;
                })
                .join("");

              const deviceCards = (plane.devices || [])
                .map((device, deviceIndex) => {
                  const totalDevices = plane.devices?.length || 0;
                  const deviceFields = Object.entries(device.attributes || {})
                    .map(([key, value]) => `
                  <div class="device-field">
                    <label>${escapeHtml(key)}</label>
                    ${renderStructureInput("scanPlaneDevice", key, value, {
                      className: "device-attr",
                      dataset: {
                        "plane-index": planeIndex,
                        "device-index": deviceIndex,
                        field: key,
                      },
                      name: `scanplane-device-${planeIndex}-${deviceIndex}-${key}`,
                    })}
                  </div>`)
                    .join("");

                  return `
                <div class="device-card" data-plane-index="${planeIndex}" data-device-index="${deviceIndex}">
                  <details class="device-details">
                    <summary>
                      <span>Device #${deviceIndex + 1}</span>
                      <span class="device-summary">${device.attributes.DeviceName || ""}</span>
                      <button
                        type="button"
                        class="inline-btn inline-danger"
                        data-action="remove-device"
                        data-plane-index="${planeIndex}"
                        data-device-index="${deviceIndex}"
                        ${totalDevices > 1 ? "" : "disabled"}
                      >
                        Remove
                      </button>
                    </summary>
                    <div class="device-fields">${deviceFields}</div>
                  </details>
                </div>`;
                })
                .join("");

              const canRemovePlane = scanPlanes.length > 1;
              return `
            <div class="scanplane-card" data-plane-index="${planeIndex}">
              <details class="scanplane-details">
                <summary>
                  <span>ScanPlane #${planeIndex + 1}</span>
                  <span class="scanplane-summary">${plane.attributes.Name || ""}</span>
                  <button
                    type="button"
                    class="inline-btn inline-danger"
                    data-action="remove-scanplane"
                    data-plane-index="${planeIndex}"
                    ${canRemovePlane ? "" : "disabled"}
                  >
                    Remove
                  </button>
                </summary>
                <div class="scanplane-fields">${planeFields}</div>
                <div class="scanplane-devices">
                  ${deviceCards || "<p>No devices yet.</p>"}
                  <div class="scanplane-actions">
                    <button
                      type="button"
                      class="inline-btn add-device-btn"
                      data-action="add-device"
                      data-plane-index="${planeIndex}"
                    >
                      + Device
                    </button>
                  </div>
                </div>
              </details>
            </div>`;
            })
            .join("");
          regenerateFieldsConfiguration();
        }

        function ensureDefaultScanDevices(plane) {
          if (!plane) {
            return;
          }
          plane.devices = Array.isArray(plane.devices) ? plane.devices : [];
          const existingNames = new Set(
            plane.devices
              .map((device) => (device.attributes?.DeviceName || "").toLowerCase())
              .filter(Boolean)
          );
          defaultScanDeviceTemplates.forEach((template) => {
            const templateName = (template.DeviceName || "").toLowerCase();
            if (templateName && !existingNames.has(templateName)) {
              const newDevice = createDefaultDevice(plane.devices.length, template);
              plane.devices.push(newDevice);
              existingNames.add(templateName);
            }
          });
        }

        function updateScanPlaneAttribute(planeIndex, field, value) {
          if (scanPlanes[planeIndex]) {
            scanPlanes[planeIndex].attributes[field] = value;
            if (field === "Name") {
              const summary = document.querySelector(
                `.scanplane-card[data-plane-index="${planeIndex}"] .scanplane-summary`
              );
              if (summary) {
                summary.textContent = value;
              }
            }
          }
        }

        function updateDeviceAttribute(planeIndex, deviceIndex, field, value) {
          const plane = scanPlanes[planeIndex];
          if (plane && plane.devices && plane.devices[deviceIndex]) {
            plane.devices[deviceIndex].attributes[field] = value;
            if (field === "DeviceName") {
              const deviceSummary = document.querySelector(
                `.device-card[data-plane-index="${planeIndex}"][data-device-index="${deviceIndex}"] .device-summary`
              );
              if (deviceSummary) {
                deviceSummary.textContent = value;
              }
            }
          }
        }

        function getScanPlaneDeviceOptions() {
          const options = [];
          const seen = new Set();
          scanPlanes.forEach((plane) => {
            (plane.devices || []).forEach((device, index) => {
              const attrs = device.attributes || {};
              const name = (attrs.DeviceName || attrs.Typekey || `Device ${index + 1}`).trim();
              if (!name) {
                return;
              }
              const key = name.toLowerCase();
              if (seen.has(key)) {
                return;
              }
              seen.add(key);
              options.push({
                deviceName: name,
                typekey: attrs.Typekey || "",
                typekeyDisplayVersion: attrs.TypekeyDisplayVersion || "",
                typekeyVersion: attrs.TypekeyVersion || "",
                label: attrs.Typekey ? `${name} (${attrs.Typekey})` : name,
              });
            });
          });
          return options;
        }

        function findScanPlaneDeviceByTypekey(typekey) {
          if (!typekey) {
            return null;
          }
          for (const plane of scanPlanes) {
            for (const device of plane.devices || []) {
              if ((device.attributes || {}).Typekey === typekey) {
                return device;
              }
            }
          }
          return null;
        }

        function findScanPlaneDeviceByName(name) {
          if (!name) {
            return null;
          }
          const normalized = name.trim().toLowerCase();
          for (const plane of scanPlanes) {
            for (const device of plane.devices || []) {
              const deviceName = (device.attributes || {}).DeviceName || "";
              if (deviceName.trim().toLowerCase() === normalized) {
                return device;
              }
            }
          }
          return null;
        }

        function applyScanPlaneDeviceAttributes(targetDevice, { deviceName, typekey } = {}) {
          targetDevice.attributes = targetDevice.attributes || {};
          if (deviceName) {
            targetDevice.attributes.DeviceName = deviceName;
          }
          let source =
            (deviceName && findScanPlaneDeviceByName(deviceName)) ||
            (typekey && findScanPlaneDeviceByTypekey(typekey)) ||
            null;
          if (!source) {
            return;
          }
          const attrs = source.attributes || {};
          targetDevice.attributes.Typekey = attrs.Typekey || typekey || targetDevice.attributes.Typekey || "";
          targetDevice.attributes.TypekeyDisplayVersion =
            attrs.TypekeyDisplayVersion || targetDevice.attributes.TypekeyDisplayVersion || "";
          targetDevice.attributes.TypekeyVersion =
            attrs.TypekeyVersion || targetDevice.attributes.TypekeyVersion || "";
        }

        function registerTriOrbShapeLookup(shape, index) {
          if (!shape || !shape.id) {
            return;
          }
          triOrbShapeLookup.set(shape.id, shape);
          if (Number.isInteger(index)) {
            triOrbShapeIndexLookup.set(shape.id, index);
          } else {
            const derivedIndex = triorbShapes.indexOf(shape);
            if (derivedIndex >= 0) {
              triOrbShapeIndexLookup.set(shape.id, derivedIndex);
            }
          }
        }

        function rebuildTriOrbShapeLookup() {
          triOrbShapeLookup.clear();
          triOrbShapeIndexLookup.clear();
          triorbShapes.forEach((shape, index) => {
            if (shape?.id) {
              triOrbShapeLookup.set(shape.id, shape);
              triOrbShapeIndexLookup.set(shape.id, index);
            }
          });
        }

        function findTriOrbShapeById(shapeId) {
          if (!shapeId) {
            return null;
          }
          return triOrbShapeLookup.get(shapeId) || null;
        }

        function getTriOrbShapeIndexById(shapeId) {
          if (!shapeId) {
            return -1;
          }
          const cached = triOrbShapeIndexLookup.get(shapeId);
          if (Number.isInteger(cached)) {
            return cached;
          }
          const fallbackIndex = triorbShapes.findIndex((shape) => shape.id === shapeId);
          if (fallbackIndex >= 0) {
            triOrbShapeIndexLookup.set(shapeId, fallbackIndex);
          }
          return fallbackIndex;
        }

        function normalizeFieldShapeRefs(field) {
          if (!field) {
            return [];
          }
          if (Array.isArray(field.shapeRefs) && field.shapeRefs.length) {
            return field.shapeRefs
              .map((ref) => (ref && ref.shapeId ? { shapeId: ref.shapeId } : null))
              .filter(Boolean);
          }
          return [];
        }

        function getDefaultFieldName(index) {
          return defaultFieldNames[index] || `Field ${index + 1}`;
        }

        function initializeFieldsets(data) {
          if (!Array.isArray(data) || !data.length) {
            return [createDefaultFieldset(0)];
          }
          return data.map((fieldset, index) => {
            const userVisible = fieldset.visible !== false;
            return {
              attributes: {
                Name: fieldset.attributes?.Name || `Fieldset ${index + 1}`,
                ...fieldset.attributes,
              },
              fields:
                Array.isArray(fieldset.fields) && fieldset.fields.length
                  ? fieldset.fields.map((field, fieldIndex) => ({
                      attributes: {
                        Name: field.attributes?.Name || getDefaultFieldName(fieldIndex),
                        ...field.attributes,
                      },
                      shapeRefs: normalizeFieldShapeRefs(field),
                    }))
                  : [createDefaultField(0), createDefaultField(1)],
              userVisible,
              visible: userVisible,
              forcedVisibleCount: 0,
            };
          });
        }

        function createDefaultFieldset(index = fieldsets.length) {
          const isFirst = index === 0;
          return {
            attributes: {
              Name: isFirst ? "Default" : `Fieldset ${index + 1}`,
              NameLatin9Key: `FS_DEFAULT_${index + 1}`,
            },
            fields: [createDefaultField(0), createDefaultField(1)],
            userVisible: true,
            visible: true,
            forcedVisibleCount: 0,
          };
        }

        function syncFieldsetVisibility(fieldset) {
          if (!fieldset) {
            return false;
          }
          const userVisible = fieldset.userVisible !== false;
          const forcedCount = Number(fieldset.forcedVisibleCount) || 0;
          const nextVisible = userVisible || forcedCount > 0;
          const changed = fieldset.visible !== nextVisible;
          fieldset.visible = nextVisible;
          if (changed) {
            invalidateFieldsetTraces();
          }
          return changed;
        }

        function setFieldsetUserVisibility(fieldset, isVisible) {
          if (!fieldset) {
            return false;
          }
          fieldset.userVisible = isVisible;
          return syncFieldsetVisibility(fieldset);
        }

        function adjustFieldsetForcedVisibility(fieldset, delta) {
          if (!fieldset || !Number.isFinite(delta)) {
            return false;
          }
          const current = Number(fieldset.forcedVisibleCount) || 0;
          const next = Math.max(0, current + delta);
          if (current === next) {
            return syncFieldsetVisibility(fieldset);
          }
          fieldset.forcedVisibleCount = next;
          return syncFieldsetVisibility(fieldset);
        }

        function createDefaultField(index = 0) {
          const samplingValue =
            typeof globalMultipleSampling === "undefined"
              ? "2"
              : globalMultipleSampling;
          const newShape = createDefaultTriOrbShape(triorbShapes.length, "Polygon");
          triorbShapes.push(newShape);
          registerTriOrbShapeInRegistry(newShape, triorbShapes.length - 1);
          invalidateTriOrbShapeCaches();
          const fieldtype = fieldTypeLabels[index] || fieldTypeLabels[0];
          return {
            attributes: {
              Name: getDefaultFieldName(index),
              Fieldtype: fieldtype,
              MultipleSampling: samplingValue,
              Resolution: "70",
              TolerancePositive: "0",
              ToleranceNegative: "0",
            },
            shapeRefs: [{ shapeId: newShape.id }],
          };
        }

        function deriveInitialMultipleSampling(fieldsetList) {
          for (const fieldset of fieldsetList) {
            if (!fieldset.fields) continue;
            for (const field of fieldset.fields) {
              if (field.attributes?.MultipleSampling) {
                return field.attributes.MultipleSampling;
              }
            }
          }
          return "2";
        }

        function deriveFieldAttribute(fieldsetList, key, fallback) {
          for (const fieldset of fieldsetList) {
            if (!fieldset.fields) continue;
            for (const field of fieldset.fields) {
              if (field.attributes && key in field.attributes) {
                return parseNumeric(field.attributes[key], fallback);
              }
            }
          }
          return fallback;
        }

        function applyGlobalMultipleSampling(value, { rerender = true } = {}) {
          globalMultipleSampling = value;
          if (globalMultipleSamplingInput) {
            globalMultipleSamplingInput.value = value;
          }
          updateGlobalFieldAttributes();
          if (rerender) {
            renderFieldsets();
          }
        }

        function createDefaultPolygon() {
          return {
            attributes: { Type: "CutOut" },
            points: [
              { X: "0", Y: "0" },
              { X: "100", Y: "0" },
              { X: "100", Y: "100" },
              { X: "0", Y: "100" },
            ],
          };
        }

        function createDefaultRectangle() {
          return {
            Type: "Field",
            OriginX: "0",
            OriginY: "0",
            Height: "100",
            Width: "100",
            Rotation: "0",
          };
        }

        function createDefaultCircle() {
          return {
            Type: "Field",
            CenterX: "0",
            CenterY: "0",
            Radius: "100",
          };
        }

        function formatFieldsetAttribute(fieldsetIndex, key, value) {
          return `
              <div class="fieldset-field">
                <label>${escapeHtml(key)}</label>
                <input
                  type="text"
                  class="fieldset-attr"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field="${escapeHtml(key)}"
                  value="${escapeHtml(value ?? "")}"
                />
              </div>`;
        }

        function formatFieldAttribute(fieldsetIndex, fieldIndex, key, value) {
          const hidden =
            ["MultipleSampling", "Resolution", "TolerancePositive", "ToleranceNegative"].includes(
              key
            ) && !debugMode;
          if (hidden) return "";
          const hiddenClass = hidden ? "field-attribute debug-hidden" : "field-attribute";
          if (key === "Fieldtype") {
            const options = ["ProtectiveSafeBlanking", "WarningSafeBlanking"]
              .map(
                (opt) =>
                  `<option value="${opt}"${opt === value ? " selected" : ""}>${opt}</option>`
              )
              .join("");
            return `
              <div class="${hiddenClass}">
                <label>${escapeHtml(key)}</label>
                <select
                  class="field-attr"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-field="${escapeHtml(key)}"
                >
                  ${options}
                </select>
              </div>`;
          }
          if (key === "MultipleSampling") {
            return `
              <div class="${hiddenClass}">
                <label>${escapeHtml(key)}</label>
                <input type="number" value="${escapeHtml(globalMultipleSampling)}" min="2" max="16" readonly />
              </div>`;
          }
          if (key === "Resolution") {
            return `
              <div class="${hiddenClass}">
                <label>${escapeHtml(key)}</label>
                <input type="number" value="${escapeHtml(String(globalResolution))}" readonly />
              </div>`;
          }
          if (key === "TolerancePositive" || key === "ToleranceNegative") {
            const bound = key === "TolerancePositive" ? globalTolerancePositive : globalToleranceNegative;
            return `
              <div class="${hiddenClass}">
                <label>${escapeHtml(key)}</label>
                <input type="number" value="${escapeHtml(String(bound))}" readonly />
              </div>`;
          }
          return `
              <div class="field-attribute">
                <label>${escapeHtml(key)}</label>
                <input
                  type="text"
                  class="field-attr"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-field="${escapeHtml(key)}"
                  value="${escapeHtml(value ?? "")}"
                />
              </div>`;
        }


        function formatReplicateNumber(value) {
          if (!Number.isFinite(value)) {
            return "0";
          }
          return String(Math.round(value * 1000) / 1000);
        }

        function computeReplicationScale(scalePercent, step) {
          const numericPercent = Number(scalePercent) || 0;
          const incremental = 1 + (numericPercent / 100) * step;
          if (!Number.isFinite(incremental) || incremental <= 0) {
            return 1;
          }
          return Math.max(0.01, incremental);
        }

        function transformPolygonPoints(
          points,
          {
            offsetX = 0,
            offsetY = 0,
            rotation = 0,
            rotationOriginX = 0,
            rotationOriginY = 0,
            scale = 1,
            preserveOrientation = false,
            ellipseRatio = 1,
          } = {}
        ) {
          const numericPoints = (points || []).map((point) => ({
            x: parseNumeric(point.X, 0),
            y: parseNumeric(point.Y, 0),
          }));
          if (!numericPoints.length) {
            return [];
          }
          const scaleFactor = Number.isFinite(scale) ? scale : 1;
          const hasScale = scaleFactor !== 1;
          const hasRotation = rotation !== 0;
          const radians = hasRotation ? degreesToRadians(rotation) : 0;
          const originX = Number(rotationOriginX) || 0;
          const originY = Number(rotationOriginY) || 0;
          const safeEllipseRatio =
            Number.isFinite(ellipseRatio) && ellipseRatio > 0 ? ellipseRatio : 1;
          let transformedPoints = numericPoints.map((point) => {
            let x = point.x;
            let y = point.y;
            if (hasScale) {
              x *= scaleFactor;
              y *= scaleFactor;
            }
            return { x, y };
          });
          if (hasRotation && preserveOrientation) {
            const centroid = computePointCentroid(transformedPoints);
            if (centroid) {
              const rotatedCentroid = rotatePointWithEllipse(
                centroid.x,
                centroid.y,
                radians,
                originX,
                originY,
                safeEllipseRatio
              );
              const deltaX = rotatedCentroid.x - centroid.x;
              const deltaY = rotatedCentroid.y - centroid.y;
              transformedPoints = transformedPoints.map((point) => ({
                x: point.x + deltaX,
                y: point.y + deltaY,
              }));
            } else {
              transformedPoints = transformedPoints.map((point) =>
                rotatePointWithEllipse(
                  point.x,
                  point.y,
                  radians,
                  originX,
                  originY,
                  safeEllipseRatio
                )
              );
            }
          } else if (hasRotation) {
            transformedPoints = transformedPoints.map((point) =>
              rotatePointWithEllipse(
                point.x,
                point.y,
                radians,
                originX,
                originY,
                safeEllipseRatio
              )
            );
          }
          transformedPoints = transformedPoints.map((point) => ({
            x: point.x + offsetX,
            y: point.y + offsetY,
          }));
          return transformedPoints.map((point) => ({
            X: formatReplicateNumber(point.x),
            Y: formatReplicateNumber(point.y),
          }));
        }

        function computePointCentroid(points = []) {
          if (!points.length) {
            return null;
          }
          if (points.length === 1) {
            return { ...points[0] };
          }
          let area = 0;
          let centroidX = 0;
          let centroidY = 0;
          for (let i = 0; i < points.length; i += 1) {
            const current = points[i];
            const next = points[(i + 1) % points.length];
            const cross = current.x * next.y - next.x * current.y;
            area += cross;
            centroidX += (current.x + next.x) * cross;
            centroidY += (current.y + next.y) * cross;
          }
          area *= 0.5;
          if (Math.abs(area) < 1e-10) {
            const sum = points.reduce(
              (acc, point) => {
                acc.x += point.x;
                acc.y += point.y;
                return acc;
              },
              { x: 0, y: 0 }
            );
            return {
              x: sum.x / points.length,
              y: sum.y / points.length,
            };
          }
          return {
            x: centroidX / (6 * area),
            y: centroidY / (6 * area),
          };
        }

        function applyReplicationTransform(shape, transform = {}) {
          if (!shape) {
            return;
          }
          const offsetX = Number(transform.offsetX) || 0;
          const offsetY = Number(transform.offsetY) || 0;
          const rotation = Number(transform.rotation) || 0;
          const rotationOriginX = Number(transform.rotationOriginX) || 0;
          const rotationOriginY = Number(transform.rotationOriginY) || 0;
          const rawScale = Number(transform.scale);
          const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
          const ellipseRatio =
            Number.isFinite(transform.ellipseRatio) && transform.ellipseRatio > 0
              ? Number(transform.ellipseRatio)
              : 1;
          const hasRotation = rotation !== 0;
          const hasScale = scale !== 1;
          const preserveOrientation = Boolean(transform.preserveOrientation);
          const widthSineGain =
            preserveOrientation && Number.isFinite(transform.widthSineGain)
              ? Number(transform.widthSineGain)
              : 0;
          const heightSineGain =
            preserveOrientation && Number.isFinite(transform.heightSineGain)
              ? Number(transform.heightSineGain)
              : 0;
          const rotationRadians = hasRotation ? degreesToRadians(rotation) : 0;
          if (!offsetX && !offsetY && !hasRotation && !hasScale) {
            return;
          }
          if (shape.type === "Polygon" && shape.polygon) {
            shape.polygon.points = transformPolygonPoints(shape.polygon.points || [], {
              offsetX,
              offsetY,
              rotation,
              rotationOriginX,
              rotationOriginY,
              scale,
              preserveOrientation,
              ellipseRatio,
            });
          } else if (shape.type === "Rectangle" && shape.rectangle) {
            let originX = parseNumeric(shape.rectangle.OriginX, 0);
            let originY = parseNumeric(shape.rectangle.OriginY, 0);
            const baseRotation = parseNumeric(shape.rectangle.Rotation, 0);
            let width = parseNumeric(shape.rectangle.Width, NaN);
            let height = parseNumeric(shape.rectangle.Height, NaN);
            if (hasScale) {
              originX *= scale;
              originY *= scale;
              if (Number.isFinite(width)) {
                width *= scale;
              }
              if (Number.isFinite(height)) {
                height *= scale;
              }
            }
            if (hasRotation) {
              const rotated = rotatePointWithEllipse(
                originX,
                originY,
                rotationRadians,
                rotationOriginX,
                rotationOriginY,
                ellipseRatio
              );
              originX = rotated.x;
              originY = rotated.y;
            }
            originX += offsetX;
            originY += offsetY;
            shape.rectangle.OriginX = formatReplicateNumber(originX);
            shape.rectangle.OriginY = formatReplicateNumber(originY);
            const applySineGain =
              preserveOrientation && hasRotation && (widthSineGain !== 0 || heightSineGain !== 0);
            if (applySineGain) {
              const sineComponent = Math.sin(rotationRadians);
              if (Number.isFinite(width) && widthSineGain !== 0) {
                width += widthSineGain * sineComponent;
              }
              if (Number.isFinite(height) && heightSineGain !== 0) {
                height += heightSineGain * sineComponent;
              }
            }
            if (Number.isFinite(width) && (hasScale || applySineGain)) {
              shape.rectangle.Width = formatReplicateNumber(width);
            }
            if (Number.isFinite(height) && (hasScale || applySineGain)) {
              shape.rectangle.Height = formatReplicateNumber(height);
            }
            if (hasRotation) {
              const nextRotation = preserveOrientation
                ? baseRotation
                : normalizeDegrees(baseRotation + rotation);
              shape.rectangle.Rotation = formatReplicateNumber(nextRotation);
            }
          } else if (shape.type === "Circle" && shape.circle) {
            let centerX = parseNumeric(shape.circle.CenterX, 0);
            let centerY = parseNumeric(shape.circle.CenterY, 0);
            if (hasScale) {
              centerX *= scale;
              centerY *= scale;
            }
            if (hasRotation) {
              const rotated = rotatePointWithEllipse(
                centerX,
                centerY,
                rotationRadians,
                rotationOriginX,
                rotationOriginY,
                ellipseRatio
              );
              centerX = rotated.x;
              centerY = rotated.y;
            }
            centerX += offsetX;
            centerY += offsetY;
            shape.circle.CenterX = formatReplicateNumber(centerX);
            shape.circle.CenterY = formatReplicateNumber(centerY);
            if (hasScale) {
              const radius = parseNumeric(shape.circle.Radius, NaN);
              if (Number.isFinite(radius)) {
                shape.circle.Radius = formatReplicateNumber(radius * scale);
              }
            }
          }
        }

        function offsetPolygonPoints(points, delta) {
          if (!Array.isArray(points) || !points.length || delta === 0) {
            return null;
          }
          const numericPoints = points.map((point) => ({
            x: parseNumeric(point.X, 0),
            y: parseNumeric(point.Y, 0),
          }));
          const centroid = computePointCentroid(numericPoints);
          if (!centroid) {
            return null;
          }
          return numericPoints.map((point) => {
            const deltaX = point.x - centroid.x;
            const deltaY = point.y - centroid.y;
            const adjustAxis = (component) => {
              if (!Number.isFinite(component)) {
                return 0;
              }
              const magnitude = Math.abs(component);
              const nextMagnitude = Math.max(0, magnitude + delta);
              const sign = component >= 0 ? 1 : -1;
              return sign * nextMagnitude;
            };
            return {
              X: formatReplicateNumber(centroid.x + adjustAxis(deltaX)),
              Y: formatReplicateNumber(centroid.y + adjustAxis(deltaY)),
            };
          });
        }

        function applyShapeInsetOutset(shape, delta) {
          if (!shape || delta === 0) {
            return false;
          }
          if (shape.type === "Rectangle" && shape.rectangle) {
            const width = parseNumeric(shape.rectangle.Width, NaN);
            const height = parseNumeric(shape.rectangle.Height, NaN);
            if (!Number.isFinite(width) || !Number.isFinite(height)) {
              return false;
            }
            const originX = parseNumeric(shape.rectangle.OriginX, 0);
            const originY = parseNumeric(shape.rectangle.OriginY, 0);
            const centerX = originX + width / 2;
            const centerY = originY - height / 2;
            const nextWidth = Math.max(0, width + 2 * delta);
            const nextHeight = Math.max(0, height + 2 * delta);
            shape.rectangle.Width = formatReplicateNumber(nextWidth);
            shape.rectangle.Height = formatReplicateNumber(nextHeight);
            shape.rectangle.OriginX = formatReplicateNumber(centerX - nextWidth / 2);
            shape.rectangle.OriginY = formatReplicateNumber(centerY + nextHeight / 2);
            return true;
          }
          if (shape.type === "Circle" && shape.circle) {
            const radius = parseNumeric(shape.circle.Radius, NaN);
            if (!Number.isFinite(radius)) {
              return false;
            }
            const nextRadius = Math.max(0, radius + delta);
            shape.circle.Radius = formatReplicateNumber(nextRadius);
            return true;
          }
          if (shape.type === "Polygon" && shape.polygon) {
            const adjustedPoints = offsetPolygonPoints(shape.polygon.points || [], delta);
            if (adjustedPoints) {
              shape.polygon.points = adjustedPoints;
              return true;
            }
          }
          return false;
        }

        function duplicateShapeForReplication(shapeId, transform, context = {}) {
          if (!shapeId) {
            return null;
          }
          const sourceShape = findTriOrbShapeById(shapeId);
          if (!sourceShape) {
            return null;
          }
          const clonedShape = cloneShape(sourceShape);
          if (!clonedShape) {
            return null;
          }
          clonedShape.id = createShapeId();
          const suffix = context.copyIndex ? `Copy ${context.copyIndex}` : "Copy";
          const baseName = sourceShape.name || sourceShape.id;
          clonedShape.name = `${baseName} ${suffix}`.trim();
          clonedShape.visible = true;
          applyReplicationTransform(clonedShape, transform);
          triorbShapes.push(clonedShape);
          registerTriOrbShapeInRegistry(clonedShape, triorbShapes.length - 1);
          invalidateTriOrbShapeCaches();
          return clonedShape.id;
        }

        function isCutOutShape(shape) {
          if (!shape) {
            return false;
          }
          const kind =
            shape.kind ||
            shape.rectangle?.Type ||
            shape.circle?.Type ||
            getPolygonTypeValue(shape.polygon) ||
            shape.polygon?.Type;
          return String(kind || "").toLowerCase() === "cutout";
        }

        function buildShapeIdLookup() {
          const lookup = new Map();
          if (!Array.isArray(triorbShapes)) {
            return lookup;
          }
          triorbShapes.forEach((shape, index) => {
            lookup.set(String(shape.id), index + 1);
          });
          return lookup;
        }

        function findPrimaryShapeIdForField(field) {
          if (!field) {
            return null;
          }
          let fallback = null;
          const refs = Array.isArray(field.shapeRefs) ? field.shapeRefs : [];
          for (const ref of refs) {
            const shape = findTriOrbShapeById(ref?.shapeId);
            if (!shape) {
              continue;
            }
            if (!isCutOutShape(shape)) {
              return shape.id;
            }
            if (!fallback) {
              fallback = shape.id;
            }
          }
          return fallback;
        }

        function findPrimaryShapeIdForFieldset(fieldset) {
          if (!fieldset) {
            return null;
          }
          let fallback = null;
          const fields = Array.isArray(fieldset.fields) ? fieldset.fields : [];
          for (const field of fields) {
            const primaryShapeId = findPrimaryShapeIdForField(field);
            if (primaryShapeId && !isCutOutShape(findTriOrbShapeById(primaryShapeId))) {
              return primaryShapeId;
            }
            if (!fallback && primaryShapeId) {
              fallback = primaryShapeId;
            }
          }
          return fallback;
        }

        function getUserFieldIdForShapeId(shapeId) {
          if (!shapeId) {
            return "";
          }
          const userFieldDefinitions = collectUserFieldDefinitions();
          for (const entry of userFieldDefinitions) {
            const shapeRefs = Array.isArray(entry.field?.shapeRefs)
              ? entry.field.shapeRefs
              : [];
            if (
              shapeRefs.some((ref) => ref?.shapeId && String(ref.shapeId) === String(shapeId))
            ) {
              return entry.id;
            }
          }
          return "";
        }

        function getFieldsetIndexesForCase(caseIndex) {
          const assignments = caseFieldAssignments[caseIndex];
          if (!assignments || !assignments.size) {
            return [];
          }
          return Array.from(assignments)
            .map((value) => Number(value))
            .filter((value) =>
              Number.isFinite(value) && value >= 0 && value < fieldsets.length
            )
            .sort((a, b) => a - b);
        }

        function assignCasesToFieldsets(assignments = []) {
          if (!assignments.length) {
            return;
          }
          if (!casetableEvals?.evals?.length) {
            return;
          }
          assignments.forEach(({ caseIndex, userFieldId }) => {
            if (!Number.isFinite(caseIndex) || !userFieldId) {
              return;
            }
            casetableEvals.evals.forEach((evalEntry) => {
              const evalCase = evalEntry?.cases?.[caseIndex];
              if (evalCase?.scanPlane) {
                evalCase.scanPlane.userFieldId = userFieldId;
              }
            });
          });
        }

        function buildReplicatedField(baseField, { copyIndex, transform, includeCutouts }) {
          if (!baseField) {
            return null;
          }
          const attributes = cloneAttributes(baseField.attributes);
          if (attributes.NameLatin9Key) {
            attributes.NameLatin9Key = `${attributes.NameLatin9Key}_${copyIndex}`;
          } else {
            attributes.NameLatin9Key = generateLatin9Key();
          }
          const shapeRefs = Array.isArray(baseField.shapeRefs) ? baseField.shapeRefs : [];
          const filteredRefs = shapeRefs.filter((ref) => {
            if (!ref?.shapeId) {
              return false;
            }
            if (includeCutouts) {
              return true;
            }
            const shape = findTriOrbShapeById(ref.shapeId);
            return !isCutOutShape(shape);
          });
          const newRefs = filteredRefs
            .map((ref) => duplicateShapeForReplication(ref?.shapeId, transform, { copyIndex }))
            .filter(Boolean)
            .map((shapeId) => ({ shapeId }));
          return {
            attributes,
            shapeRefs: newRefs,
          };
        }

        function buildReplicatedFieldset(baseFieldset, {
          copyIndex,
          transform,
          name,
          includeCutouts,
        }) {
          if (!baseFieldset) {
            return null;
          }
          const baseFields = Array.isArray(baseFieldset.fields) ? baseFieldset.fields : [];
          const attributes = cloneAttributes(baseFieldset.attributes);
          attributes.Name = name || attributes.Name || `Fieldset ${copyIndex}`;
          if (attributes.NameLatin9Key) {
            attributes.NameLatin9Key = `${attributes.NameLatin9Key}_${copyIndex}`;
          } else {
            attributes.NameLatin9Key = generateLatin9Key();
          }
          const fields = baseFields
            .map((field) =>
              buildReplicatedField(field, {
                copyIndex,
                transform,
                includeCutouts,
              })
            )
            .filter(Boolean);
          return {
            attributes,
            fields,
            visible: true,
          };
        }

        function prependPreviousFieldsetFields(targetFieldset, previousFieldset, options = {}) {
          if (!targetFieldset || !previousFieldset) {
            return;
          }
          const targetFields = Array.isArray(targetFieldset.fields) ? targetFieldset.fields : [];
          if (!targetFields.length) {
            return;
          }
          const previousFields = Array.isArray(previousFieldset.fields) ? previousFieldset.fields : [];
          if (!previousFields.length) {
            return;
          }
          const identityTransform = {
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
            scale: 1,
            preserveOrientation: true,
          };
          const previousFieldsByType = previousFields.reduce((lookup, field) => {
            const typeKey = field?.attributes?.Fieldtype || "";
            if (!lookup.has(typeKey)) {
              lookup.set(typeKey, []);
            }
            lookup.get(typeKey).push(field);
            return lookup;
          }, new Map());
          const cloneShapeRefs = (baseField) => {
            const shapeRefs = Array.isArray(baseField?.shapeRefs) ? baseField.shapeRefs : [];
            const filteredRefs = shapeRefs.filter((ref) => {
              if (!ref?.shapeId) {
                return false;
              }
              if (options.includeCutouts) {
                return true;
              }
              const shape = findTriOrbShapeById(ref.shapeId);
              return !isCutOutShape(shape);
            });
            return filteredRefs
              .map((ref) =>
                duplicateShapeForReplication(ref.shapeId, identityTransform, {
                  copyIndex: options.copyIndex ?? 0,
                })
              )
              .filter(Boolean)
              .map((shapeId) => ({ shapeId }));
          };
          targetFields.forEach((targetField) => {
            const typeKey = targetField?.attributes?.Fieldtype || "";
            const candidates = previousFieldsByType.get(typeKey);
            if (!candidates?.length) {
              return;
            }
            const previousField = candidates.shift();
            const clonedRefs = cloneShapeRefs(previousField);
            if (!clonedRefs.length) {
              return;
            }
            const existingRefs = Array.isArray(targetField.shapeRefs) ? targetField.shapeRefs : [];
            targetField.shapeRefs = [...clonedRefs, ...existingRefs];
          });
        }

        function buildReplicatedCase(
          baseCase,
          { caseIndex, prefix, staticInputs: staticInputsOverride, speedRange }
        ) {
          if (!baseCase) {
            return null;
          }
          const attributes = cloneAttributes(baseCase.attributes);
          const displayIndex = caseIndex + 1;
          const baseName = prefix || attributes.Name || buildCaseName(caseIndex);
          attributes.Name = `${baseName} ${displayIndex}`.trim();
          attributes.DisplayOrder = String(caseIndex);
          delete attributes.NameLatin9Key;
          const staticInputSource = Array.isArray(staticInputsOverride)
            ? staticInputsOverride
            : Array.isArray(baseCase.staticInputs)
              ? baseCase.staticInputs
              : [];
          const staticInputs = staticInputSource.map((entry) => {
            const valueKey = entry?.valueKey || resolveStaticInputValueKey(entry?.attributes || {});
            return {
              attributes: { ...(entry?.attributes || {}) },
              valueKey,
            };
          });
          const speedActivation = {
            attributes: { ...(baseCase.speedActivation?.attributes || {}) },
            modeKey: baseCase.speedActivation?.modeKey || "Mode",
          };
          const activationMinSpeed =
            typeof speedRange?.activationMinSpeed !== "undefined"
              ? normalizeSpeedRangeValue(speedRange.activationMinSpeed)
              : baseCase.activationMinSpeed ?? "0";
          const activationMaxSpeed =
            typeof speedRange?.activationMaxSpeed !== "undefined"
              ? normalizeSpeedRangeValue(speedRange.activationMaxSpeed)
              : baseCase.activationMaxSpeed ?? "0";
          const layout = Array.isArray(baseCase.layout)
            ? baseCase.layout
                .map((segment) => {
                  if (!segment || typeof segment !== "object") {
                    return null;
                  }
                  if (segment.kind === "node" && segment.node) {
                    return { kind: "node", node: cloneGenericNode(segment.node) };
                  }
                  return { ...segment };
                })
                .filter(Boolean)
            : [];
          return {
            attributes,
            staticInputs,
            staticInputsPlacement: baseCase.staticInputsPlacement || "case",
            speedActivation,
            speedActivationPlacement: baseCase.speedActivationPlacement || "case",
            activationMinSpeed,
            activationMaxSpeed,
            layout,
          };
        }

        function normalizeStaticInputStateValue(value) {
          const normalized = String(value ?? "").toLowerCase();
          if (normalized === "high") {
            return "high";
          }
          if (normalized === "low") {
            return "low";
          }
          return "dontcare";
        }

        function createStaticInputsAutoIncrementer(baseCase) {
          const desiredCount = casetableConfigurationStaticInputsCount;
          const sourceList = Array.isArray(baseCase?.staticInputs) ? baseCase.staticInputs : [];
          const preparedList = [];
          for (let index = 0; index < desiredCount; index += 1) {
            const sourceEntry = sourceList[index] || createDefaultStaticInput(`StaticInput ${index + 1}`);
            const template = { ...(sourceEntry?.attributes || {}) };
            if (!template.Name) {
              template.Name = `StaticInput ${index + 1}`;
            }
            const valueKey = sourceEntry?.valueKey || resolveStaticInputValueKey(template);
            if (!(valueKey in template)) {
              template[valueKey] = "DontCare";
            }
            preparedList.push({ template, valueKey });
          }
          const dontCareFlags = preparedList.map((entry) =>
            normalizeStaticInputStateValue(entry.template?.[entry.valueKey]) === "dontcare"
          );
          const activationFlags = new Array(preparedList.length).fill(false);
          const modulus = Math.max(1, 2 ** preparedList.length);
          const baseValue = preparedList.reduce((sum, entry, index) => {
            const shift = preparedList.length - 1 - index;
            const state = normalizeStaticInputStateValue(entry.template?.[entry.valueKey]);
            if (state === "high") {
              return sum + 2 ** shift;
            }
            return sum;
          }, 0);
          let step = 0;
          return {
            next() {
              step += 1;
              const value = (baseValue + step) % modulus;
              return preparedList.map((entry, index) => {
                const shift = preparedList.length - 1 - index;
                const bit = preparedList.length ? (value >> shift) & 1 : 0;
                const shouldKeepDontCare =
                  dontCareFlags[index] && !activationFlags[index] && bit === 0;
                const attributes = { ...(entry.template || {}) };
                if (shouldKeepDontCare) {
                  attributes[entry.valueKey] = "DontCare";
                } else {
                  attributes[entry.valueKey] = bit ? "High" : "Low";
                  if (dontCareFlags[index]) {
                    activationFlags[index] = true;
                  }
                }
                return { attributes, valueKey: entry.valueKey };
              });
            },
          };
        }

        function createSpeedRangeAutoIncrementer(baseCase, { minStep = 0, maxStep = 0 } = {}) {
          const minIncrement = Number(minStep) || 0;
          const maxIncrement = Number(maxStep) || 0;
          if (!minIncrement && !maxIncrement) {
            return null;
          }
          const baseMin = Number(baseCase?.activationMinSpeed);
          const baseMax = Number(baseCase?.activationMaxSpeed);
          const resolvedBaseMin = Number.isFinite(baseMin) ? baseMin : 0;
          const resolvedBaseMax = Number.isFinite(baseMax) ? baseMax : 0;
          let step = 0;
          return {
            next() {
              step += 1;
              const activationMinSpeed = normalizeSpeedRangeValue(
                resolvedBaseMin + minIncrement * step
              );
              const activationMaxSpeed = normalizeSpeedRangeValue(
                resolvedBaseMax + maxIncrement * step
              );
              return { activationMinSpeed, activationMaxSpeed };
            },
          };
        }

        function updateReplicateButtonState() {
          if (!replicateFieldBtn) {
            return;
          }
          const hasFieldsetTargets = hasFieldsetReplicationTarget();
          const hasCaseTargets = hasCaseReplicationTarget();
          replicateFieldBtn.disabled = !hasFieldsetTargets && !hasCaseTargets;
        }

        function renderFieldsets() {
          invalidateFieldsetTraces();
          if (!fieldsetsContainer) {
            return;
          }
          const detailState = captureFieldsetDetailState();
          if (!fieldsets.length) {
            fieldsetsContainer.innerHTML = "<p>No fieldsets defined.</p>";
            return;
          }
          const totalFieldsets = fieldsets.length;
          fieldsetsContainer.innerHTML = fieldsets
            .map((fieldset, fieldsetIndex) => {
              const fieldsetFields = Object.entries(fieldset.attributes || {})
                .map(([key, value]) => formatFieldsetAttribute(fieldsetIndex, key, value))
                .join("");

              const fieldCount = Array.isArray(fieldset.fields)
                ? fieldset.fields.length
                : 0;
              const canRemoveField = fieldCount > 1;
              const canRemoveFieldset = totalFieldsets > 1;

              const fieldCards = (fieldset.fields || [])
                .map((field, fieldIndex) => {
                  const fieldAttrs = Object.entries(field.attributes || {})
                    .map(([key, value]) => {
                      if (key === "Fieldtype") {
                        const options = [
                          "ProtectiveSafeBlanking",
                          "WarningSafeBlanking",
                        ]
                          .map(
                            (opt) =>
                              `<option value="${opt}"${
                                opt === value ? " selected" : ""
                              }>${opt}</option>`
                          )
                          .join("");
                        return `
              <div class="field-attribute">
                <label>${escapeHtml(key)}</label>
                <select
                  class="field-attr"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-field="${escapeHtml(key)}"
                >
                  ${options}
                </select>
              </div>`;
                      }
                      if (key === "MultipleSampling") {
                        return `
              <div class="field-attribute">
                <label>${escapeHtml(key)}</label>
                <input
                  type="number"
                  value="${escapeHtml(globalMultipleSampling)}"
                  min="2"
                  max="16"
                  readonly
                />
              </div>`;
                      }
                      return formatFieldAttribute(fieldsetIndex, fieldIndex, key, value);
                    })
                    .join("");

                  const shapeRefs = Array.isArray(field.shapeRefs) ? field.shapeRefs : [];
                  const shapeItems =
                    shapeRefs
                      .map((shapeRef, shapeIndex) => {
                        const shape = findTriOrbShapeById(shapeRef.shapeId);
                        if (!shape) {
                          return `
                            <div class="field-shape-entry missing">
                              <span>Shape removed</span>
                            </div>`;
                        }
                        return `
                          <div
                            class="field-shape-entry"
                            data-shape-index="${shapeIndex}"
                          >
                            <div class="shape-info">
                              <span class="shape-name">${escapeHtml(
                                shape.name || shape.id
                              )}</span>
                              <span class="shape-type">${escapeHtml(shape.type)}</span>
                            </div>
                            <div class="shape-actions">
                              <button
                                type="button"
                                class="inline-btn shape-mini-btn"
                                data-action="edit-field-shape"
                                data-shape-id="${escapeHtml(shape.id)}"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                class="inline-btn inline-danger shape-mini-btn"
                                data-action="remove-field-shape"
                                data-fieldset-index="${fieldsetIndex}"
                                data-field-index="${fieldIndex}"
                                data-shape-index="${shapeIndex}"
                              >
                                Remove
                              </button>
                            </div>
                          </div>`;
                      })
                      .join("") || "<p>No shapes assigned.</p>";
                  const shapeControls = renderFieldShapeControls(
                    fieldsetIndex,
                    fieldIndex,
                    field
                  );

                  return `
            <div
              class="field-card"
              data-fieldset-index="${fieldsetIndex}"
              data-field-index="${fieldIndex}"
            >
                  <details class="field-details">
                    <summary>
                      <span>Field #${fieldIndex + 1}</span>
                      <span class="field-summary">${field.attributes.Name || ""}</span>
                      <button
                        type="button"
                        class="inline-btn secondary shape-mini-btn"
                        data-action="edit-field"
                        data-fieldset-index="${fieldsetIndex}"
                        data-field-index="${fieldIndex}"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="inline-btn inline-danger"
                        data-action="remove-field"
                        data-fieldset-index="${fieldsetIndex}"
                        data-field-index="${fieldIndex}"
                        ${canRemoveField ? "" : "disabled"}
                      >
                        Remove
                      </button>
                    </summary>
                    <div class="field-attributes">${fieldAttrs}</div>
                <div class="shape-section">
                  <h4>Assigned Shapes</h4>
                  <div class="shape-list">${shapeItems}</div>
                  ${shapeControls}
                </div>
              </details>
            </div>`;
                })
                .join("") || "<p>No fields defined.</p>";

              return `
          <div class="fieldset-card" data-fieldset-index="${fieldsetIndex}">
            <details class="fieldset-details">
              <summary>
                <span>Fieldset #${fieldsetIndex + 1}</span>
                <span class="fieldset-summary">${fieldset.attributes.Name || ""}</span>
                <button
                  type="button"
                  class="inline-btn inline-danger"
                  data-action="remove-fieldset"
                  data-fieldset-index="${fieldsetIndex}"
                  ${canRemoveFieldset ? "" : "disabled"}
                >
                  Remove
                </button>
              </summary>
              <div class="fieldset-fields">${fieldsetFields}</div>
              <div class="field-card-list">
                ${fieldCards}
                <div class="field-actions">
                  <button
                    type="button"
                    class="inline-btn"
                    data-action="add-field"
                    data-fieldset-index="${fieldsetIndex}"
                  >
                    + Field
                  </button>
                </div>
              </div>
            </details>
          </div>`;
          })
          .join("");
          refreshCaseFieldAssignments({
            rerenderFieldsetToggles: false,
            rerenderFigure: false,
            rerenderCaseToggles: false,
          });
          renderFieldsetCheckboxes();
          renderFigure();
          regenerateFieldsConfiguration();
          restoreFieldsetDetailState(detailState);
          updateReplicateButtonState();
        }

        function renderFieldShapeControls(fieldsetIndex, fieldIndex, field) {
          const currentIds = new Set((field.shapeRefs || []).map((ref) => ref.shapeId));
          const availableShapes = triorbShapes.filter((shape) => !currentIds.has(shape.id));
          if (!availableShapes.length) {
            return `<p class="shape-controls-note">No additional shapes to add.</p>`;
          }
          const options = availableShapes
            .map(
              (shape) =>
                `<option value="${escapeHtml(shape.id)}">${escapeHtml(
                  shape.name || shape.id
                )} (${escapeHtml(shape.type)})</option>`
            )
            .join("");
          return `
            <div class="shape-controls">
              <select
                class="field-shape-selector"
                data-fieldset-index="${fieldsetIndex}"
                data-field-index="${fieldIndex}"
              >
                ${options}
              </select>
              <button
                type="button"
                class="inline-btn"
                data-action="add-field-shape"
                data-fieldset-index="${fieldsetIndex}"
                data-field-index="${fieldIndex}"
              >
                Add Shape
              </button>
            </div>`;
        }

        function renderCreateFieldShapeLists() {
          createFieldShapeLists.forEach((listObj, fieldIndex) => {
            shapeKinds.forEach((kind) => {
              const list = listObj[kind];
              if (!list) {
                return;
              }
              const filteredShapes = triorbShapes.filter((shape) => shape.kind === kind);
              if (!filteredShapes.length) {
                list.innerHTML = '<p class="toggle-pill-empty">No shapes available.</p>';
                return;
              }
              list.innerHTML = filteredShapes
                .map((shape) => {
                  const shapeId = escapeHtml(shape.id);
                  const shapeName = escapeHtml(shape.name || shape.id);
                  return `
                    <button
                      type="button"
                      class="toggle-pill-btn create-field-shape-btn"
                      data-field-index="${fieldIndex}"
                      data-kind="${kind}"
                      data-shape-id="${shapeId}"
                      aria-pressed="false"
                    >
                      <span>${shapeName}</span>
                      <span class="shape-type">${escapeHtml(shape.type)}</span>
                    </button>`;
                })
                .join("");
              setCreateFieldShapeSelections(fieldIndex, kind, Array.from(createFieldModalFieldShapeSelections[fieldIndex][kind]));
            });
          });
          updateFieldModalPreview();
        }

        function setCreateFieldShapeSelections(fieldIndex, kind, shapeIds = []) {
          const selection =
            createFieldModalFieldShapeSelections[fieldIndex]?.[kind] ||
            new Set();
          selection.clear();
          shapeIds.forEach((shapeId) => {
            if (shapeId) {
              selection.add(shapeId);
            }
          });
          const list = createFieldShapeLists[fieldIndex]?.[kind];
          if (!list) {
            updateFieldModalPreview();
            return;
          }
          list.querySelectorAll(".create-field-shape-btn").forEach((button) => {
            if (button.dataset.kind !== kind) {
              return;
            }
            const shapeId = button.dataset.shapeId;
            const isActive = selection.has(shapeId);
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
          });
          updateFieldModalPreview();
        }

        function handleCreateFieldShapeToggle(event) {
          const button = event.target.closest(".create-field-shape-btn");
          if (
            !button ||
            button.dataset.fieldIndex === undefined ||
            !button.dataset.shapeId ||
            !button.dataset.kind
          ) {
            return;
          }
          event.preventDefault();
          const fieldIndex = Number(button.dataset.fieldIndex);
          const kind = button.dataset.kind;
          const shapeId = button.dataset.shapeId;
          const selection = createFieldModalFieldShapeSelections[fieldIndex]?.[kind];
          if (!selection) {
            return;
          }
          if (selection.has(shapeId)) {
            selection.delete(shapeId);
          } else {
            selection.add(shapeId);
          }
          const isActive = selection.has(shapeId);
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
          updateFieldModalPreview();
        }

        function getFieldPreviewColor(entry) {
          if (entry.kind === "CutOut") {
            return { stroke: "rgba(15, 15, 15, 0.92)", fill: withAlpha("#111", 0.12) };
          }
          if (entry.fieldType === "WarningSafeBlanking") {
            return { stroke: "rgba(249, 115, 22, 0.92)", fill: withAlpha("#f97316", 0.12) };
          }
          return { stroke: "rgba(239, 68, 68, 0.92)", fill: withAlpha("#ef4444", 0.12) };
        }

        function updateFieldModalPreview() {
          const entries = [];
          createFieldModalFieldShapeSelections.forEach((selection, fieldIndex) => {
            shapeKinds.forEach((kind) => {
              const shapeIds = Array.from(selection[kind] || []);
              const fieldName =
                createFieldNameInputs[fieldIndex]?.value?.trim() || getDefaultFieldName(fieldIndex);
              const fieldType = fieldTypeLabels[fieldIndex] || fieldTypeLabels[0];
              entries.push({ fieldName, fieldType, shapeIds, kind });
            });
          });
          const hasShapes = entries.some((entry) => entry.shapeIds.length);
          fieldModalPreview = hasShapes ? entries : null;
          renderFigure();
        }

        function buildFieldModalPreviewTraces() {
          if (!Array.isArray(fieldModalPreview) || !fieldModalPreview.length) {
            return [];
          }
          const traces = [];
          fieldModalPreview.forEach((entry, entryIndex) => {
            const colorSet = getFieldPreviewColor(entry);
            entry.shapeIds.forEach((shapeId, shapeIndex) => {
              const shapeIndexGlobal = triorbShapes.findIndex((shape) => shape.id === shapeId);
              const shape = triorbShapes[shapeIndexGlobal];
              if (!shape) {
                return;
              }
              const fieldLabel = `${entry.fieldName || getDefaultFieldName(entryIndex)} (${entry.fieldType})`;
              let trace = null;
              switch (shape.type) {
                case "Rectangle":
                  if (shape.rectangle) {
                    trace = buildRectangleTrace(
                      shape.rectangle,
                      colorSet,
                      `${fieldLabel} / ${shape.name || shape.type}`,
                      entry.fieldType,
                      0,
                      0,
                      shapeIndex
                    );
                  }
                  break;
                case "Circle":
                  if (shape.circle) {
                    trace = buildCircleTrace(
                      shape.circle,
                      colorSet,
                      `${fieldLabel} / ${shape.name || shape.type}`,
                      entry.fieldType,
                      0,
                      0,
                      shapeIndex
                    );
                  }
                  break;
                case "Polygon":
                default:
                  if (shape.polygon) {
                    trace = buildPolygonTrace(
                      shape.polygon,
                      colorSet,
                      `${fieldLabel} / ${shape.name || shape.type}`,
                      entry.fieldType,
                      0,
                      0,
                      shapeIndex
                    );
                  }
                  break;
              }
              if (trace) {
                trace.name = `${fieldLabel} / ${shape.name || shape.type}`;
                trace.meta = { ...(trace.meta || {}), preview: true };
                traces.push(trace);
              }
            });
          });
          return traces;
        }

        function collectFieldsetPreviewTraces(fieldset, options = {}) {
          const {
            colorSet,
            labelPrefix,
            transform,
            includeCutouts,
            fieldsetIndex,
          } = options;
          if (!fieldset || !Array.isArray(fieldset.fields) || !fieldset.fields.length) {
            return [];
          }
          const traces = [];
          fieldset.fields.forEach((field, fieldIndex) => {
            const fieldType = field.attributes?.Fieldtype || "ProtectiveSafeBlanking";
            const fieldName = field.attributes?.Name || `Field ${fieldIndex + 1}`;
            (field.shapeRefs || []).forEach((shapeRef, shapeRefIndex) => {
              const baseShape = findTriOrbShapeById(shapeRef?.shapeId);
              if (!baseShape) {
                return;
              }
              if (!includeCutouts && isCutOutShape(baseShape)) {
                return;
              }
              const previewShape = cloneShape(baseShape);
              if (!previewShape) {
                return;
              }
              applyReplicationTransform(previewShape, transform);
              const shapeName = baseShape.name || baseShape.type;
              const label = `${labelPrefix} / ${fieldName} / ${shapeName}`;
              let trace = null;
              switch (previewShape.type) {
                case "Rectangle":
                  if (previewShape.rectangle) {
                    trace = buildRectangleTrace(
                      previewShape.rectangle,
                      colorSet,
                      label,
                      fieldType,
                      fieldsetIndex,
                      fieldIndex,
                      shapeRefIndex
                    );
                  }
                  break;
                case "Circle":
                  if (previewShape.circle) {
                    trace = buildCircleTrace(
                      previewShape.circle,
                      colorSet,
                      label,
                      fieldType,
                      fieldsetIndex,
                      fieldIndex,
                      shapeRefIndex
                    );
                  }
                  break;
                case "Polygon":
                default:
                  if (previewShape.polygon) {
                    trace = buildPolygonTrace(
                      previewShape.polygon,
                      colorSet,
                      label,
                      fieldType,
                      fieldsetIndex,
                      fieldIndex,
                      shapeRefIndex
                    );
                  }
                  break;
              }
              if (trace) {
                trace.line = {
                  ...(trace.line || {}),
                  color: colorSet.stroke,
                  dash: "dot",
                  width: Math.max((trace.line && trace.line.width) || 2, 2),
                };
                trace.fillcolor = colorSet.fill;
                trace.name = label;
                trace.showlegend = false;
                trace.meta = { ...(trace.meta || {}), preview: true, replicatePreview: true };
                traces.push(trace);
              }
            });
          });
          return traces;
        }

        function buildReplicatePreviewTraces() {
          if (!replicatePreviewState) {
            return [];
          }
          const previewColorSet = {
            stroke: "rgba(14, 165, 233, 0.95)",
            fill: withAlpha("#0ea5e9", 0.08),
          };
          const { target } = replicatePreviewState;
          if (target === "case") {
            const {
              caseIndexes = [],
              copyCount = 1,
              offsetX = 0,
              offsetY = 0,
              rotation = 0,
              scalePercent = 0,
              includeCutouts = false,
              preserveOrientation = false,
            } = replicatePreviewState;
            if (!caseIndexes.length) {
              return [];
            }
            const traces = [];
            caseIndexes.forEach((caseIndex) => {
              const caseName = getReplicateCaseName(caseIndex) || `Case ${caseIndex + 1}`;
              const fieldsetIndexes = getFieldsetIndexesForCase(caseIndex);
              fieldsetIndexes.forEach((fieldsetIndex) => {
                const fieldset = fieldsets[fieldsetIndex];
                if (!fieldset || !Array.isArray(fieldset.fields) || !fieldset.fields.length) {
                  return;
                }
                const fieldsetName = fieldset.attributes?.Name || `Fieldset ${fieldsetIndex + 1}`;
                for (let step = 1; step <= copyCount; step += 1) {
              const transform = {
                offsetX: offsetX * step,
                offsetY: offsetY * step,
                rotation: rotation * step,
                rotationOriginX: replicatePreviewState.rotationOriginX,
                rotationOriginY: replicatePreviewState.rotationOriginY,
                ellipseRatio: replicatePreviewState.ellipseRatio,
                widthSineGain: replicatePreviewState.widthSineGain,
                heightSineGain: replicatePreviewState.heightSineGain,
                scale: computeReplicationScale(scalePercent, step),
                preserveOrientation,
              };
                  const copyLabel = `${caseName} / ${fieldsetName} (Copy ${step})`;
                  const previewTraces = collectFieldsetPreviewTraces(fieldset, {
                    colorSet: previewColorSet,
                    labelPrefix: copyLabel,
                    transform,
                    includeCutouts,
                    fieldsetIndex,
                  });
                  if (previewTraces.length) {
                    traces.push(...previewTraces);
                  }
                }
              });
            });
            return traces;
          }
          if (target !== "fieldset") {
            return [];
          }
          const {
            fieldsetIndex,
            copyCount,
            offsetX,
            offsetY,
            rotation,
            scalePercent,
            includeCutouts,
            preserveOrientation = false,
          } = replicatePreviewState;
          const fieldset = fieldsets[fieldsetIndex];
          if (!fieldset || !Array.isArray(fieldset.fields) || !fieldset.fields.length) {
            return [];
          }
          const traces = [];
          const fieldsetName = fieldset.attributes?.Name || `Fieldset ${fieldsetIndex + 1}`;
          for (let step = 1; step <= copyCount; step += 1) {
            const transform = {
              offsetX: offsetX * step,
              offsetY: offsetY * step,
              rotation: rotation * step,
              rotationOriginX: replicatePreviewState.rotationOriginX,
              rotationOriginY: replicatePreviewState.rotationOriginY,
              ellipseRatio: replicatePreviewState.ellipseRatio,
              widthSineGain: replicatePreviewState.widthSineGain,
              heightSineGain: replicatePreviewState.heightSineGain,
              scale: computeReplicationScale(scalePercent, step),
              preserveOrientation,
            };
            const copyLabel = `${fieldsetName} (Copy ${step})`;
            const previewTraces = collectFieldsetPreviewTraces(fieldset, {
              colorSet: previewColorSet,
              labelPrefix: copyLabel,
              transform,
              includeCutouts,
              fieldsetIndex,
            });
            if (previewTraces.length) {
              traces.push(...previewTraces);
            }
          }
          return traces;
        }

        let createFieldTargetFieldsetIndex = null;

        function openCreateFieldModalForCreate(targetFieldsetIndex = null) {
          const fieldsetIndex = Number.isFinite(targetFieldsetIndex)
            ? targetFieldsetIndex
            : null;
          createFieldTargetFieldsetIndex = fieldsetIndex;
          const targetFieldset =
            fieldsetIndex !== null && fieldsetIndex >= 0 && fieldsetIndex < fieldsets.length
              ? fieldsets[fieldsetIndex]
              : null;
          const isAppendingToExisting = Boolean(targetFieldset);

          if (createFieldsetNameInput) {
            const fieldsetName = isAppendingToExisting
              ? targetFieldset.attributes?.Name || defaultFieldsetName()
              : defaultFieldsetName();
            createFieldsetNameInput.value = fieldsetName;
            createFieldsetNameInput.readOnly = isAppendingToExisting;
          }
          if (createFieldsetLatinInput) {
            const latinKey = isAppendingToExisting
              ? targetFieldset.attributes?.NameLatin9Key || generateLatin9Key()
              : generateLatin9Key();
            createFieldsetLatinInput.value = latinKey;
            createFieldsetLatinInput.readOnly = isAppendingToExisting;
          }
          createFieldNameInputs.forEach((input, index) => {
            if (input) {
              const baseIndex = isAppendingToExisting
                ? (targetFieldset?.fields?.length || 0) + index + 1
                : index + 1;
              input.value = getDefaultFieldName(baseIndex - 1);
            }
          });
          createFieldTypeSelects.forEach((select) => {
            if (select) {
              select.value = "Field";
            }
          });
          createFieldModalFieldShapeSelections.forEach((selection) => {
            shapeKinds.forEach((kind) => {
              selection[kind]?.clear();
            });
          });
          renderCreateFieldShapeLists();
          if (createFieldModalTitle) {
            createFieldModalTitle.textContent = isAppendingToExisting ? "Add Field" : "Add Fieldset";
          }
          if (createFieldModal) {
            createFieldModal.dataset.mode = isAppendingToExisting ? "append" : "create";
            createFieldModal.classList.add("active");
            createFieldModal.setAttribute("aria-hidden", "false");
          }
          updateFieldModalPreview();
        }

        function closeCreateFieldModal() {
          fieldModalPreview = null;
          createFieldModalFieldShapeSelections.forEach((_, fieldIndex) => {
            shapeKinds.forEach((kind) => {
              setCreateFieldShapeSelections(fieldIndex, kind, []);
            });
          });
          createFieldTargetFieldsetIndex = null;
          if (createFieldModal) {
            createFieldModal.dataset.mode = "create";
            createFieldModal.classList.remove("active");
            createFieldModal.setAttribute("aria-hidden", "true");
          }
          renderFigure();
        }

        function persistCreateFieldModal() {
          const targetFieldset =
            Number.isFinite(createFieldTargetFieldsetIndex) &&
            createFieldTargetFieldsetIndex >= 0 &&
            createFieldTargetFieldsetIndex < fieldsets.length
              ? fieldsets[createFieldTargetFieldsetIndex]
              : null;
          const isAppendingToExisting = Boolean(targetFieldset);
          const fieldsetName =
            createFieldsetNameInput?.value?.trim() || defaultFieldsetName();
          const latinKey = createFieldsetLatinInput?.value?.trim() || generateLatin9Key();
          const entries = [];
          createFieldModalFieldShapeSelections.forEach((selection, fieldIndex) => {
            const allShapeIds = [];
            shapeKinds.forEach((kind) => {
              const shapeIds = Array.from(selection[kind] || []);
              shapeIds.forEach((shapeId) => allShapeIds.push(shapeId));
            });
            const fieldName =
              createFieldNameInputs[fieldIndex]?.value?.trim() || getDefaultFieldName(fieldIndex);
            entries.push({
              attributes: {
                Name: fieldName,
                Fieldtype: fieldTypeLabels[fieldIndex] || fieldTypeLabels[0],
                MultipleSampling: globalMultipleSampling ?? "2",
                Resolution: globalResolution ?? "70",
                TolerancePositive: globalTolerancePositive ?? "0",
                ToleranceNegative: globalToleranceNegative ?? "0",
              },
              shapeRefs: allShapeIds.map((shapeId) => ({ shapeId })),
            });
          });
          if (isAppendingToExisting) {
            targetFieldset.fields = Array.isArray(targetFieldset.fields)
              ? targetFieldset.fields.concat(entries)
              : [...entries];
            const targetName = targetFieldset.attributes?.Name || `Fieldset ${createFieldTargetFieldsetIndex + 1}`;
            setStatus(`${targetName} に Field を追加しました。`, "ok");
          } else {
            const newFieldset = {
              attributes: {
                Name: fieldsetName,
                NameLatin9Key: latinKey,
              },
              fields: entries,
              visible: true,
            };
            fieldsets.push(newFieldset);
            setStatus(`${fieldsetName} を作成しました。`, "ok");
          }
          renderFieldsets();
          return true;
        }


        function getReplicateFieldsetName(fieldsetIndex) {
          const fieldset = fieldsets[fieldsetIndex];
          if (!fieldset) {
            return "";
          }
          return fieldset.attributes?.Name || "";
        }

        function getReplicateCaseName(caseIndex) {
          const caseData = casetableCases[caseIndex];
          if (!caseData) {
            return "";
          }
          return caseData.attributes?.Name || buildCaseName(caseIndex);
        }

        function hasFieldsetReplicationTarget() {
          return fieldsets.some(
            (fieldset) => Array.isArray(fieldset.fields) && fieldset.fields.length
          );
        }

        function hasCaseReplicationTarget() {
          return casetableCases.length > 0;
        }

        function resolveReplicatePrefixFallback() {
          if (replicateFormState.target === "case") {
            return "Case";
          }
          return getReplicateFieldsetName(replicateFormState.fieldsetIndex) || "Fieldset";
        }

        function resolveReplicatePrefixPlaceholderLabel() {
          if (replicateFormState.target === "case") {
            const selectedIndex = replicateFormState.selectedCaseIndexes?.[0];
            return getReplicateCaseName(selectedIndex) || "Case";
          }
          return getReplicateFieldsetName(replicateFormState.fieldsetIndex) || "Fieldset";
        }

        function updateReplicatePrefixPlaceholder() {
          if (!replicateCasePrefixInput) {
            return;
          }
          replicateCasePrefixInput.placeholder = resolveReplicatePrefixPlaceholderLabel();
        }

        function updateReplicateSineGainAvailability({ syncPreview = false } = {}) {
          const enabled = Boolean(replicatePreserveOrientationInput?.checked);
          [replicateWidthSineGainInput, replicateHeightSineGainInput].forEach((input) => {
            if (input) {
              input.disabled = !enabled;
            }
          });
          if (syncPreview) {
            updateReplicatePreview();
          }
        }

        function populateReplicateFieldsetOptions(preferredIndex = 0) {
          if (!replicateFieldsetSelect) {
            return -1;
          }
          if (!fieldsets.length) {
            replicateFieldsetSelect.innerHTML = '<option value="">No fieldsets</option>';
            replicateFieldsetSelect.disabled = true;
            return -1;
          }
          const safeIndex = Math.min(Math.max(preferredIndex, 0), fieldsets.length - 1);
          replicateFieldsetSelect.disabled = false;
          replicateFieldsetSelect.innerHTML = fieldsets
            .map((fieldset, index) =>
              `<option value="${index}">${escapeHtml(fieldset.attributes?.Name || `Fieldset ${index + 1}`)}</option>`
            )
            .join("");
          replicateFieldsetSelect.value = String(safeIndex);
          return safeIndex;
        }

        function populateReplicateCaseOptions(preferredIndexes = []) {
          if (!replicateCaseSelect) {
            return [];
          }
          if (!casetableCases.length) {
            replicateCaseSelect.innerHTML = '<option value="">No cases</option>';
            replicateCaseSelect.disabled = true;
            return [];
          }
          replicateCaseSelect.disabled = false;
          replicateCaseSelect.innerHTML = casetableCases
            .map((caseData, index) => {
              const label = caseData.attributes?.Name || buildCaseName(index);
              return `<option value="${index}">${escapeHtml(label)}</option>`;
            })
            .join("");
          const normalized = Array.isArray(preferredIndexes)
            ? Array.from(
                new Set(
                  preferredIndexes
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value) && value >= 0 && value < casetableCases.length)
                )
              ).sort((a, b) => a - b)
            : [];
          const selectedIndexes = normalized.length ? normalized : [0];
          const selectedSet = new Set(selectedIndexes);
          Array.from(replicateCaseSelect.options).forEach((option) => {
            const optionIndex = Number(option.value);
            option.selected = selectedSet.has(optionIndex);
          });
          return selectedIndexes;
        }

        function captureSelectedReplicateCases() {
          if (!replicateCaseSelect || replicateCaseSelect.disabled) {
            return [];
          }
          return Array.from(replicateCaseSelect.selectedOptions || [])
            .map((option) => Number(option.value))
            .filter((value) => Number.isFinite(value) && value >= 0 && value < casetableCases.length)
            .sort((a, b) => a - b);
        }

        function setReplicateTarget(target, { updatePreview = true } = {}) {
          const normalized = target === "case" ? "case" : "fieldset";
          replicateFormState.target = normalized;
          if (replicateModalWindow) {
            replicateModalWindow.dataset.replicateTarget = normalized;
          }
          if (replicateTargetToggle) {
            const buttons = replicateTargetToggle.querySelectorAll("[data-replicate-target]");
            buttons.forEach((button) => {
              const value = button.dataset.replicateTarget === "case" ? "case" : "fieldset";
              button.classList.toggle("is-active", value === normalized);
            });
          }
          updateReplicatePrefixPlaceholder();
          if (updatePreview) {
            updateReplicatePreview();
          }
        }

        function resetReplicateModalTransform() {
          replicateModalOffsetX = 0;
          replicateModalOffsetY = 0;
          replicateModalLastDx = 0;
          replicateModalLastDy = 0;
          if (replicateModalWindow) {
            replicateModalWindow.style.transform = "translate(0px, 0px)";
            replicateModalWindow.style.width = "";
            replicateModalWindow.style.height = "";
          }
        }

        function openReplicateModal() {
          if (!replicateModal) {
            return;
          }
          const fieldsetAvailable = hasFieldsetReplicationTarget();
          const caseAvailable = hasCaseReplicationTarget();
          if (!fieldsetAvailable && !caseAvailable) {
            setStatus("複製できる Fieldset / Case がありません。", "warning");
            return;
          }
          let desiredTarget = replicateFormState.target === "case" ? "case" : "fieldset";
          if (desiredTarget === "fieldset" && !fieldsetAvailable && caseAvailable) {
            desiredTarget = "case";
          } else if (desiredTarget === "case" && !caseAvailable && fieldsetAvailable) {
            desiredTarget = "fieldset";
          }
          setReplicateTarget(desiredTarget, { updatePreview: false });
          if (fieldsetAvailable) {
            const selectedFieldsetIndex = populateReplicateFieldsetOptions(
              replicateFormState.fieldsetIndex
            );
            if (selectedFieldsetIndex >= 0) {
              replicateFormState.fieldsetIndex = selectedFieldsetIndex;
            }
          } else if (replicateFieldsetSelect) {
            replicateFieldsetSelect.innerHTML = '<option value="">No fieldsets</option>';
            replicateFieldsetSelect.disabled = true;
          }
          replicateFormState.selectedCaseIndexes = populateReplicateCaseOptions(
            replicateFormState.selectedCaseIndexes
          );
          const fallbackPrefix = replicateFormState.casePrefix || resolveReplicatePrefixFallback();
          if (replicateCopyCountInput) {
            replicateCopyCountInput.value = replicateFormState.copyCount ?? 1;
          }
          if (replicateOffsetXInput) {
            replicateOffsetXInput.value = replicateFormState.offsetX ?? 0;
          }
          if (replicateOffsetYInput) {
            replicateOffsetYInput.value = replicateFormState.offsetY ?? 0;
          }
          if (replicateRotationInput) {
            replicateRotationInput.value = replicateFormState.rotation ?? 0;
          }
          if (replicateRotationOriginXInput) {
            replicateRotationOriginXInput.value = replicateFormState.rotationOriginX ?? 0;
          }
          if (replicateRotationOriginYInput) {
            replicateRotationOriginYInput.value = replicateFormState.rotationOriginY ?? 0;
          }
          if (replicateEllipseRatioInput) {
            replicateEllipseRatioInput.value = replicateFormState.ellipseRatio ?? 1;
          }
          if (replicateWidthSineGainInput) {
            replicateWidthSineGainInput.value = replicateFormState.widthSineGain ?? 0;
          }
          if (replicateHeightSineGainInput) {
            replicateHeightSineGainInput.value = replicateFormState.heightSineGain ?? 0;
          }
          if (replicateScalePercentInput) {
            replicateScalePercentInput.value = replicateFormState.scalePercent ?? 0;
          }
          if (replicateIncludeCutoutsInput) {
            replicateIncludeCutoutsInput.checked = Boolean(
              replicateFormState.includeCutouts
            );
          }
          if (replicatePreserveOrientationInput) {
            replicatePreserveOrientationInput.checked = Boolean(
              replicateFormState.preserveOrientation
            );
          }
          updateReplicateSineGainAvailability();
          if (replicateStaticInputsAutoInput) {
            replicateStaticInputsAutoInput.checked = Boolean(
              replicateFormState.autoStaticInputs
            );
          }
          if (replicateIncludePreviousFieldsInput) {
            replicateIncludePreviousFieldsInput.checked = Boolean(
              replicateFormState.includePreviousFields
            );
          }
          if (replicateSpeedMinStepInput) {
            replicateSpeedMinStepInput.value = String(
              Number.isFinite(replicateFormState.speedRangeMinStep)
                ? replicateFormState.speedRangeMinStep
                : 0
            );
          }
          if (replicateSpeedMaxStepInput) {
            replicateSpeedMaxStepInput.value = String(
              Number.isFinite(replicateFormState.speedRangeMaxStep)
                ? replicateFormState.speedRangeMaxStep
                : 0
            );
          }
          if (replicateCasePrefixInput) {
            replicateCasePrefixInput.value = fallbackPrefix;
          }
          updateReplicatePrefixPlaceholder();
          replicateModal.classList.add("active");
          replicateModal.setAttribute("aria-hidden", "false");
          updateReplicatePreview();
          resetReplicateModalTransform();
        }

        function closeReplicateModal() {
          if (!replicateModal) {
            return;
          }
          replicateModal.classList.remove("active");
          replicateModal.setAttribute("aria-hidden", "true");
          clearReplicatePreview();
          resetReplicateModalTransform();
        }

        function handleReplicateApply() {
          if (replicateFormState.target === "case") {
            handleReplicateCasesApply();
          } else {
            handleReplicateFieldsetsApply();
          }
        }

        function handleReplicateFieldsetsApply() {
          if (!replicateFieldsetSelect) {
            return;
          }
          const fieldsetIndex = Number(replicateFieldsetSelect.value);
          if (
            Number.isNaN(fieldsetIndex) ||
            fieldsetIndex < 0 ||
            fieldsetIndex >= fieldsets.length
          ) {
            setStatus("有効な Fieldset を選択してください。", "error");
            return;
          }
          const fieldset = fieldsets[fieldsetIndex];
          if (!fieldset || !Array.isArray(fieldset.fields) || !fieldset.fields.length) {
            setStatus("選択した Fieldset に Field がありません。", "error");
            return;
          }
          let copyCount = parseInt(replicateCopyCountInput?.value ?? "1", 10);
          if (!Number.isFinite(copyCount) || copyCount < 1) {
            copyCount = 1;
          }
          copyCount = Math.min(32, copyCount);
          const offsetX = parseNumeric(replicateOffsetXInput?.value, 0) || 0;
          const offsetY = parseNumeric(replicateOffsetYInput?.value, 0) || 0;
          const rotation = parseNumeric(replicateRotationInput?.value, 0) || 0;
          const rotationOriginX = parseNumeric(replicateRotationOriginXInput?.value, 0) || 0;
          const rotationOriginY = parseNumeric(replicateRotationOriginYInput?.value, 0) || 0;
          const ellipseRatio = Math.max(
            0.01,
            parseNumeric(replicateEllipseRatioInput?.value, 1) || 1
          );
          const preserveOrientation = Boolean(replicatePreserveOrientationInput?.checked);
          const rawWidthSineGain = parseNumeric(replicateWidthSineGainInput?.value, 0) || 0;
          const rawHeightSineGain = parseNumeric(replicateHeightSineGainInput?.value, 0) || 0;
          const widthSineGain = preserveOrientation ? rawWidthSineGain : 0;
          const heightSineGain = preserveOrientation ? rawHeightSineGain : 0;
          const scalePercent = parseNumeric(replicateScalePercentInput?.value, 0) || 0;
          const includeCutouts = Boolean(replicateIncludeCutoutsInput?.checked);
          const prefixInput = replicateCasePrefixInput?.value?.trim();
          const casePrefix = prefixInput || resolveReplicatePrefixFallback();
          replicateFormState.fieldsetIndex = fieldsetIndex;
          replicateFormState.copyCount = copyCount;
          replicateFormState.offsetX = offsetX;
          replicateFormState.offsetY = offsetY;
          replicateFormState.rotation = rotation;
          replicateFormState.rotationOriginX = rotationOriginX;
          replicateFormState.rotationOriginY = rotationOriginY;
          replicateFormState.ellipseRatio = ellipseRatio;
          replicateFormState.widthSineGain = widthSineGain;
          replicateFormState.heightSineGain = heightSineGain;
          replicateFormState.scalePercent = scalePercent;
          replicateFormState.casePrefix = casePrefix;
          replicateFormState.includeCutouts = includeCutouts;
          replicateFormState.preserveOrientation = preserveOrientation;
          const createdFieldsets = [];
          const baseFieldsetCount = fieldsets.length;
          for (let step = 1; step <= copyCount; step += 1) {
            const transform = {
              offsetX: offsetX * step,
              offsetY: offsetY * step,
              rotation: rotation * step,
              rotationOriginX,
              rotationOriginY,
              ellipseRatio,
              widthSineGain,
              heightSineGain,
              scale: computeReplicationScale(scalePercent, step),
              preserveOrientation,
            };
            const nextFieldsetIndex = baseFieldsetCount + createdFieldsets.length + 1;
            const fieldsetName = `${casePrefix} ${nextFieldsetIndex}`;
            const replicatedFieldset = buildReplicatedFieldset(fieldset, {
              copyIndex: step,
              transform,
              name: fieldsetName,
              includeCutouts,
            });
            if (replicatedFieldset) {
              fieldsets.push(replicatedFieldset);
              createdFieldsets.push(replicatedFieldset);
            }
          }
          if (!createdFieldsets.length) {
            setStatus("Fieldset の複製に失敗しました。", "error");
            return;
          }
          const availableSlots = casetableCasesLimit - casetableCases.length;
          const casesToCreate = Math.min(availableSlots, createdFieldsets.length);
          const createdCaseNames = [];
          const caseAssignments = [];
          const baseCaseIndex = casetableCases.length;
          for (let idx = 0; idx < casesToCreate; idx += 1) {
            const caseIndex = baseCaseIndex + idx;
            const newCase = createDefaultCasetableCase(caseIndex);
            const caseName = `${casePrefix} ${caseIndex + 1}`;
            newCase.attributes.Name = caseName;
            casetableCases.push(newCase);
            caseToggleStates.push(false);
            createdCaseNames.push(caseName);
            const targetFieldset = createdFieldsets[idx];
            const primaryShapeId = findPrimaryShapeIdForFieldset(targetFieldset);
            const userFieldId = getUserFieldIdForShapeId(primaryShapeId);
            if (userFieldId) {
              caseAssignments.push({ caseIndex, userFieldId });
            }
          }
          syncEvalCaseAssignments();
          assignCasesToFieldsets(caseAssignments);
          renderFieldsets();
          renderTriOrbShapes();
          renderTriOrbShapeCheckboxes();
          renderCasetableCases();
          closeReplicateModal();
          let statusType = "ok";
          let caseMessage = `${createdCaseNames.length} 件の Case を追加しました。`;
          if (!createdCaseNames.length) {
            caseMessage = "Case 上限のため新規 Case は追加されませんでした。";
            statusType = "warning";
          } else if (createdCaseNames.length < createdFieldsets.length) {
            statusType = "warning";
            caseMessage = `${createdCaseNames.length} 件の Case を追加しました (上限により ${createdFieldsets.length - createdCaseNames.length} 件は未作成)。`;
          }
          const replicatedFieldCount = createdFieldsets.reduce(
            (sum, replicatedFieldset) => sum + (replicatedFieldset.fields?.length || 0),
            0
          );
          setStatus(
            `${createdFieldsets.length} 個の Fieldset (計 ${replicatedFieldCount} 個の Field) を複製しました。${caseMessage}`,
            statusType
          );
        }

        function handleReplicateCasesApply() {
          const selectedCaseIndexes = captureSelectedReplicateCases();
          if (!selectedCaseIndexes.length) {
            setStatus("複製する Case を選択してください。", "error");
            return;
          }
          let copyCount = parseInt(replicateCopyCountInput?.value ?? "1", 10);
          if (!Number.isFinite(copyCount) || copyCount < 1) {
            copyCount = 1;
          }
          copyCount = Math.min(32, copyCount);
          const prefixInput = replicateCasePrefixInput?.value?.trim();
          const casePrefix = prefixInput || resolveReplicatePrefixFallback();
          const offsetX = parseNumeric(replicateOffsetXInput?.value, 0) || 0;
          const offsetY = parseNumeric(replicateOffsetYInput?.value, 0) || 0;
          const rotation = parseNumeric(replicateRotationInput?.value, 0) || 0;
          const rotationOriginX = parseNumeric(replicateRotationOriginXInput?.value, 0) || 0;
          const rotationOriginY = parseNumeric(replicateRotationOriginYInput?.value, 0) || 0;
          const ellipseRatio = Math.max(
            0.01,
            parseNumeric(replicateEllipseRatioInput?.value, 1) || 1
          );
          const scalePercent = parseNumeric(replicateScalePercentInput?.value, 0) || 0;
          const includeCutouts = Boolean(replicateIncludeCutoutsInput?.checked);
          const preserveOrientation = Boolean(replicatePreserveOrientationInput?.checked);
          const rawWidthSineGain = parseNumeric(replicateWidthSineGainInput?.value, 0) || 0;
          const rawHeightSineGain = parseNumeric(replicateHeightSineGainInput?.value, 0) || 0;
          const widthSineGain = preserveOrientation ? rawWidthSineGain : 0;
          const heightSineGain = preserveOrientation ? rawHeightSineGain : 0;
          const autoStaticInputs = Boolean(replicateStaticInputsAutoInput?.checked);
          const includePreviousFields = Boolean(replicateIncludePreviousFieldsInput?.checked);
          let speedRangeMinStep = parseInt(replicateSpeedMinStepInput?.value ?? "0", 10);
          let speedRangeMaxStep = parseInt(replicateSpeedMaxStepInput?.value ?? "0", 10);
          if (!Number.isFinite(speedRangeMinStep)) {
            speedRangeMinStep = 0;
          }
          if (!Number.isFinite(speedRangeMaxStep)) {
            speedRangeMaxStep = 0;
          }
          replicateFormState.copyCount = copyCount;
          replicateFormState.casePrefix = casePrefix;
          replicateFormState.selectedCaseIndexes = selectedCaseIndexes;
          replicateFormState.target = "case";
          replicateFormState.offsetX = offsetX;
          replicateFormState.offsetY = offsetY;
          replicateFormState.rotation = rotation;
          replicateFormState.rotationOriginX = rotationOriginX;
          replicateFormState.rotationOriginY = rotationOriginY;
          replicateFormState.ellipseRatio = ellipseRatio;
          replicateFormState.widthSineGain = widthSineGain;
          replicateFormState.heightSineGain = heightSineGain;
          replicateFormState.scalePercent = scalePercent;
          replicateFormState.includeCutouts = includeCutouts;
          replicateFormState.preserveOrientation = preserveOrientation;
          replicateFormState.autoStaticInputs = autoStaticInputs;
          replicateFormState.speedRangeMinStep = speedRangeMinStep;
          replicateFormState.speedRangeMaxStep = speedRangeMaxStep;
          replicateFormState.includePreviousFields = includePreviousFields;
          const availableSlots = casetableCasesLimit - casetableCases.length;
          const desiredCount = selectedCaseIndexes.length * copyCount;
          if (availableSlots <= 0) {
            setStatus("Case 上限のため新規 Case は追加できません。", "warning");
            return;
          }
          const evalSnapshots = (casetableEvals?.evals || []).map((evalEntry) => ({
            cases: Array.isArray(evalEntry?.cases)
              ? evalEntry.cases.map((caseEntry) => cloneEvalCase(caseEntry))
              : [],
          }));
          const caseMappings = [];
          const createdFieldsets = [];
          const caseAssignments = [];
          const baseFieldsetCount = fieldsets.length;
          const staticInputGenerators = autoStaticInputs ? new Map() : null;
          const shouldAutoSpeedRange = speedRangeMinStep !== 0 || speedRangeMaxStep !== 0;
          const speedRangeGenerators = shouldAutoSpeedRange ? new Map() : null;
          let casesMissingFieldsets = 0;
          for (let idx = 0; idx < selectedCaseIndexes.length; idx += 1) {
            const sourceCaseIndex = selectedCaseIndexes[idx];
            const baseCase = casetableCases[sourceCaseIndex];
            if (!baseCase) {
              continue;
            }
            const fieldsetIndexes = getFieldsetIndexesForCase(sourceCaseIndex);
            const fieldsetSources = fieldsetIndexes
              .map((fieldsetIndex) => ({
                fieldsetIndex,
                fieldset: fieldsets[fieldsetIndex],
              }))
              .filter((entry) => Array.isArray(entry.fieldset?.fields) && entry.fieldset.fields.length);
            const previousFieldsetsBySource = includePreviousFields
              ? new Map(
                  fieldsetSources.map(({ fieldsetIndex, fieldset }) => [fieldsetIndex, fieldset])
                )
              : null;
            for (let step = 1; step <= copyCount; step += 1) {
              if (caseMappings.length >= availableSlots) {
                break;
              }
              const transform = {
                offsetX: offsetX * step,
                offsetY: offsetY * step,
                rotation: rotation * step,
                rotationOriginX,
                rotationOriginY,
                ellipseRatio,
                widthSineGain,
                heightSineGain,
                scale: computeReplicationScale(scalePercent, step),
                preserveOrientation,
              };
              const replicatedFieldsetsForCase = [];
              fieldsetSources.forEach(({ fieldset, fieldsetIndex }) => {
                const nextFieldsetIndex = baseFieldsetCount + createdFieldsets.length + 1;
                const fieldsetName = `${casePrefix} ${nextFieldsetIndex}`;
                const replicatedFieldset = buildReplicatedFieldset(fieldset, {
                  copyIndex: step,
                  transform,
                  name: fieldsetName,
                  includeCutouts,
                });
                if (replicatedFieldset) {
                  if (includePreviousFields && previousFieldsetsBySource) {
                    const previousFieldset = previousFieldsetsBySource.get(fieldsetIndex);
                    if (previousFieldset) {
                      prependPreviousFieldsetFields(replicatedFieldset, previousFieldset, {
                        copyIndex: step,
                        includeCutouts,
                      });
                    }
                  }
                  fieldsets.push(replicatedFieldset);
                  createdFieldsets.push(replicatedFieldset);
                  replicatedFieldsetsForCase.push(replicatedFieldset);
                  if (includePreviousFields && previousFieldsetsBySource) {
                    previousFieldsetsBySource.set(fieldsetIndex, replicatedFieldset);
                  }
                }
              });
              const targetCaseIndex = casetableCases.length;
              let staticInputsOverride = null;
              if (staticInputGenerators) {
                let generator = staticInputGenerators.get(sourceCaseIndex);
                if (!generator) {
                  generator = createStaticInputsAutoIncrementer(baseCase);
                  staticInputGenerators.set(sourceCaseIndex, generator);
                }
                staticInputsOverride = generator?.next() || null;
              }
              let speedRangeOverride = null;
              if (speedRangeGenerators) {
                let generator = speedRangeGenerators.get(sourceCaseIndex);
                if (!generator) {
                  generator = createSpeedRangeAutoIncrementer(baseCase, {
                    minStep: speedRangeMinStep,
                    maxStep: speedRangeMaxStep,
                  });
                  speedRangeGenerators.set(sourceCaseIndex, generator);
                }
                speedRangeOverride = generator?.next() || null;
              }
              const newCase = buildReplicatedCase(baseCase, {
                caseIndex: targetCaseIndex,
                prefix: casePrefix,
                staticInputs: staticInputsOverride,
                speedRange: speedRangeOverride,
              });
              if (!newCase) {
                continue;
              }
              casetableCases.push(newCase);
              caseToggleStates.push(false);
              caseMappings.push({ sourceCaseIndex, targetCaseIndex });
              const primaryFieldset = replicatedFieldsetsForCase[0];
              if (primaryFieldset) {
                const primaryShapeId = findPrimaryShapeIdForFieldset(primaryFieldset);
                const userFieldId = getUserFieldIdForShapeId(primaryShapeId);
                if (userFieldId) {
                  caseAssignments.push({ caseIndex: targetCaseIndex, userFieldId });
                }
              } else if (!fieldsetSources.length) {
                casesMissingFieldsets += 1;
              }
            }
            if (caseMappings.length >= availableSlots) {
              break;
            }
          }
          if (!caseMappings.length) {
            setStatus("Case の複製に失敗しました。", "error");
            return;
          }
          syncEvalCaseAssignments();
          (casetableEvals?.evals || []).forEach((evalEntry, evalIndex) => {
            const snapshotCases = evalSnapshots[evalIndex]?.cases || [];
            if (!Array.isArray(evalEntry.cases)) {
              return;
            }
            caseMappings.forEach(({ sourceCaseIndex, targetCaseIndex }) => {
              const templateCase = snapshotCases[sourceCaseIndex];
              if (templateCase) {
                const cloned = cloneEvalCase(templateCase);
                if (cloned) {
                  cloned.attributes = cloned.attributes || {};
                  cloned.attributes.Id = String(targetCaseIndex);
                  evalEntry.cases[targetCaseIndex] = cloned;
                }
              } else if (evalEntry.cases[targetCaseIndex]?.attributes) {
                evalEntry.cases[targetCaseIndex].attributes.Id = String(targetCaseIndex);
              }
            });
          });
          assignCasesToFieldsets(caseAssignments);
          if (createdFieldsets.length) {
            renderFieldsets();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
          }
          renderCasetableCases();
          renderCasetableEvals();
          refreshCaseFieldAssignments({ rerenderCaseToggles: true });
          closeReplicateModal();
          let statusType = "ok";
          let statusMessage = `${caseMappings.length} 件の Case を複製しました。`;
          if (caseMappings.length < desiredCount) {
            statusType = "warning";
            statusMessage = `${caseMappings.length} 件の Case を複製しました (上限により ${desiredCount - caseMappings.length} 件は未作成)。`;
          }
          if (createdFieldsets.length) {
            const replicatedFieldCount = createdFieldsets.reduce(
              (sum, replicatedFieldset) => sum + (replicatedFieldset.fields?.length || 0),
              0
            );
            statusMessage += ` ${createdFieldsets.length} 個の Fieldset (計 ${replicatedFieldCount} 個の Field) を複製しました。`;
          } else {
            statusMessage += " 紐づく Fieldset は複製されませんでした。";
          }
          if (casesMissingFieldsets) {
            statusType = statusType === "error" ? "error" : "warning";
            statusMessage += ` ${casesMissingFieldsets} 件の Case では紐づく Fieldset が見つかりませんでした。`;
          }
          setStatus(statusMessage, statusType);
        }

        function captureReplicatePreviewValues() {
          if (!replicateModal?.classList.contains("active")) {
            return null;
          }
          const target = replicateFormState.target === "case" ? "case" : "fieldset";
          let copyCount = parseInt(replicateCopyCountInput?.value ?? "1", 10);
          if (!Number.isFinite(copyCount) || copyCount < 1) {
            copyCount = 1;
          }
          copyCount = Math.min(32, copyCount);
          if (replicateCopyCountInput) {
            replicateCopyCountInput.value = String(copyCount);
          }
          const offsetX = parseNumeric(replicateOffsetXInput?.value, 0) || 0;
          const offsetY = parseNumeric(replicateOffsetYInput?.value, 0) || 0;
          const rotation = parseNumeric(replicateRotationInput?.value, 0) || 0;
          const rotationOriginX = parseNumeric(replicateRotationOriginXInput?.value, 0) || 0;
          const rotationOriginY = parseNumeric(replicateRotationOriginYInput?.value, 0) || 0;
          const ellipseRatio = Math.max(
            0.01,
            parseNumeric(replicateEllipseRatioInput?.value, 1) || 1
          );
          const scalePercent = parseNumeric(replicateScalePercentInput?.value, 0) || 0;
          const includeCutouts = Boolean(replicateIncludeCutoutsInput?.checked);
          const preserveOrientation = Boolean(replicatePreserveOrientationInput?.checked);
          const widthSineGain = parseNumeric(replicateWidthSineGainInput?.value, 0) || 0;
          const heightSineGain = parseNumeric(replicateHeightSineGainInput?.value, 0) || 0;
          let speedRangeMinStep = parseInt(replicateSpeedMinStepInput?.value ?? "0", 10);
          let speedRangeMaxStep = parseInt(replicateSpeedMaxStepInput?.value ?? "0", 10);
          if (!Number.isFinite(speedRangeMinStep)) {
            speedRangeMinStep = 0;
          }
          if (!Number.isFinite(speedRangeMaxStep)) {
            speedRangeMaxStep = 0;
          }
          const effectiveWidthSineGain = preserveOrientation ? widthSineGain : 0;
          const effectiveHeightSineGain = preserveOrientation ? heightSineGain : 0;
          if (target === "case") {
            const caseIndexes = captureSelectedReplicateCases();
            return {
              target,
              caseIndexes,
              copyCount,
              offsetX,
              offsetY,
              rotation,
              rotationOriginX,
              rotationOriginY,
              ellipseRatio,
              widthSineGain: effectiveWidthSineGain,
              heightSineGain: effectiveHeightSineGain,
              scalePercent,
              includeCutouts,
              preserveOrientation,
              autoStaticInputs: Boolean(replicateStaticInputsAutoInput?.checked),
              speedRangeMinStep,
              speedRangeMaxStep,
              includePreviousFields: Boolean(replicateIncludePreviousFieldsInput?.checked),
            };
          }
          if (!replicateFieldsetSelect || !fieldsets.length) {
            return null;
          }
          const fieldsetIndex = Number(replicateFieldsetSelect.value);
          if (
            Number.isNaN(fieldsetIndex) ||
            fieldsetIndex < 0 ||
            fieldsetIndex >= fieldsets.length
          ) {
            return null;
          }
          const fieldset = fieldsets[fieldsetIndex];
          if (!fieldset || !Array.isArray(fieldset.fields) || !fieldset.fields.length) {
            return null;
          }
          return {
            target,
            fieldsetIndex,
            copyCount,
            offsetX,
            offsetY,
            rotation,
            rotationOriginX,
            rotationOriginY,
            ellipseRatio,
            widthSineGain: effectiveWidthSineGain,
            heightSineGain: effectiveHeightSineGain,
            scalePercent,
            includeCutouts,
            preserveOrientation,
          };
        }

        function updateReplicatePreview() {
          const nextState = captureReplicatePreviewValues();
          const stateChanged = JSON.stringify(nextState) !== JSON.stringify(replicatePreviewState);
          replicatePreviewState = nextState;
          if (stateChanged) {
            renderFigure();
          }
        }

        function clearReplicatePreview() {
          if (!replicatePreviewState) {
            return;
          }
          replicatePreviewState = null;
          renderFigure();
        }

        function registerTriOrbShapeInRegistry(shape, index) {
          if (!shape) {
            return;
          }
          registerTriOrbShapeLookup(shape, index);
          let attrs = {};
          let points = [];
          if (shape.type === "Polygon" && shape.polygon) {
            attrs = { Type: getPolygonTypeValue(shape.polygon) || shape.polygon.Type || "Field" };
            points = (shape.polygon.points || []).map((point) => ({
              X: String(point.X ?? "0"),
              Y: String(point.Y ?? "0"),
            }));
          } else if (shape.type === "Rectangle" && shape.rectangle) {
            attrs = { ...shape.rectangle };
          } else if (shape.type === "Circle" && shape.circle) {
            attrs = { ...shape.circle };
          } else {
            return;
          }
          const key = buildShapeKey(shape.type, attrs, points);
          if (key) {
            triOrbShapeRegistry.set(key, shape.id);
          }
        }

        function rebuildTriOrbShapeRegistry() {
          triOrbShapeRegistry.clear();
          rebuildTriOrbShapeLookup();
          triorbShapes.forEach((shape, index) => registerTriOrbShapeInRegistry(shape, index));
          invalidateTriOrbShapeCaches();
        }

        function ensureTriOrbShapeFromGeometry(shapeType, attrs = {}, points = [], context = {}) {
          const normalizedAttrs = { ...(attrs || {}) };
          let keyAttrs = normalizedAttrs;
          let normalizedPoints = points;
          if (shapeType === "Polygon") {
            const polygonType =
              normalizedAttrs.Type ||
              normalizedAttrs.type ||
              context.kind ||
              "Field";
            keyAttrs = { Type: polygonType };
            normalizedPoints = (points || []).map((point) => ({
              X: String(point.X ?? point.x ?? "0"),
              Y: String(point.Y ?? point.y ?? "0"),
            }));
          }
          const shapeKey = buildShapeKey(shapeType, keyAttrs, normalizedPoints);
          if (shapeKey && triOrbShapeRegistry.has(shapeKey)) {
            const existingId = triOrbShapeRegistry.get(shapeKey);
            if (!triOrbImportContext.triOrbRootFound) {
              console.debug("reuse shape from registry", { shapeType, existingId, context });
            }
            return existingId;
          }
          const nameParts = [];
          if (context.fieldsetName) {
            nameParts.push(context.fieldsetName);
          }
          if (context.fieldName) {
            nameParts.push(context.fieldName);
          }
          nameParts.push(shapeType);
          const shapeName =
            nameParts.filter(Boolean).join(" ").trim() ||
            `${shapeType} Shape ${triorbShapes.length + 1}`;
          const shape = createDefaultTriOrbShape(triorbShapes.length, shapeType);
          shape.id = normalizedAttrs.ID || createShapeId();
          shape.name = shapeName;
          shape.fieldtype = context.fieldtype || shape.fieldtype;
          if (shapeType === "Polygon") {
            shape.polygon = {
              Type: keyAttrs.Type || "Field",
              points: normalizedPoints,
            };
          } else if (shapeType === "Rectangle") {
            shape.rectangle = { ...shape.rectangle, ...normalizedAttrs };
          } else if (shapeType === "Circle") {
            shape.circle = { ...shape.circle, ...normalizedAttrs };
          }
          shape.type = shapeType;
          const inferredKind =
            keyAttrs.Type ||
            normalizedAttrs.Type ||
            (shapeType === "Polygon" ? getPolygonTypeValue(shape.polygon) : undefined) ||
            "Field";
          applyShapeKind(shape, inferredKind);
          triorbShapes.push(shape);
          registerTriOrbShapeInRegistry(shape, triorbShapes.length - 1);
          invalidateTriOrbShapeCaches();
          if (!triOrbImportContext.triOrbRootFound) {
            console.debug("ensureTriOrbShapeFromGeometry created", {
              shapeType,
              attrs: normalizedAttrs,
              points: normalizedPoints,
              context,
              shapeId: shape.id,
            });
          }
          return shape.id;
        }

        function renderTriOrbShapes() {
          if (!triorbShapesContainer) {
            return;
          }
          syncBulkEditSelections();
          if (!triorbShapes.length) {
            triOrbShapeCardCache.clear();
            triOrbShapesListInitialized = false;
            triorbShapesContainer.innerHTML = "<p>No shapes defined.</p>";
            renderCasetableEvals();
            return;
          }
          if (!triOrbShapesListInitialized) {
            triorbShapesContainer.innerHTML = "";
            triOrbShapesListInitialized = true;
          }
          const renderedShapeIds = new Set();
          triorbShapes.forEach((shape, shapeIndex) => {
            const shapeId = shape.id;
            let card = triOrbShapeCardCache.get(shapeId);
            if (!card) {
              card = document.createElement("div");
            }
            updateTriOrbShapeCardElement(card, shapeIndex, shape);
            triOrbShapeCardCache.set(shapeId, card);
            renderedShapeIds.add(shapeId);
            triorbShapesContainer.appendChild(card);
          });
          Array.from(triOrbShapeCardCache.keys()).forEach((shapeId) => {
            if (!renderedShapeIds.has(shapeId)) {
              const cachedCard = triOrbShapeCardCache.get(shapeId);
              if (cachedCard?.parentNode === triorbShapesContainer) {
                triorbShapesContainer.removeChild(cachedCard);
              }
              triOrbShapeCardCache.delete(shapeId);
            }
          });
          if (createFieldModal) {
            renderCreateFieldShapeLists();
          }
          renderCasetableEvals();
        }

        function updateTriOrbShapeCardElement(card, shapeIndex, shape) {
          const shapeSignature = buildTriOrbShapeCardSignature(shape);
          const shouldUpdateMarkup = card.dataset.shapeSignature !== shapeSignature;
          card.className = "triorb-shape-card";
          card.dataset.shapeIndex = String(shapeIndex);
          card.dataset.shapeId = shape.id;
          if (shouldUpdateMarkup) {
            card.innerHTML = renderTriOrbShapeCard(shapeIndex, shape);
            card.dataset.shapeSignature = shapeSignature;
          } else {
            syncTriOrbShapeCardIndexes(card, shapeIndex);
          }
        }

        function syncTriOrbShapeCardIndexes(card, shapeIndex) {
          const nextIndexValue = String(shapeIndex);
          card.querySelectorAll("[data-shape-index]").forEach((node) => {
            node.dataset.shapeIndex = nextIndexValue;
          });
        }

        function buildTriOrbShapeCardSignature(shape) {
          const base = {
            id: shape.id || "",
            name: shape.name || "",
            fieldtype: shape.fieldtype || "",
            kind: shape.kind || "",
            type: shape.type || "",
          };
          if (shape.type === "Rectangle") {
            base.dimensions = {
              OriginX: shape.rectangle?.OriginX ?? "",
              OriginY: shape.rectangle?.OriginY ?? "",
              Width: shape.rectangle?.Width ?? "",
              Height: shape.rectangle?.Height ?? "",
              Rotation: shape.rectangle?.Rotation ?? "",
            };
          } else if (shape.type === "Circle") {
            base.dimensions = {
              CenterX: shape.circle?.CenterX ?? "",
              CenterY: shape.circle?.CenterY ?? "",
              Radius: shape.circle?.Radius ?? "",
            };
          } else {
            base.dimensions = {
              Type: shape.polygon?.Type || getPolygonTypeValue(shape.polygon) || shape.kind || "Field",
              points: (shape.polygon?.points || []).map((point) => `${point.X ?? ""},${point.Y ?? ""}`),
            };
          }
          return JSON.stringify(base);
        }

        function renderTriOrbShapeCard(shapeIndex, shape) {
          const details = renderTriOrbShapeDetails(shape, shapeIndex);
          const geometrySelect = ["Polygon", "Rectangle", "Circle"]
            .map(
              (type) =>
                `<option value="${type}"${
                  type === shape.type ? " selected" : ""
                }>${type}</option>`
            )
            .join("");
          const fieldtypeSelect = ["ProtectiveSafeBlanking", "WarningSafeBlanking"]
            .map(
              (opt) =>
                `<option value="${opt}"${
                  opt === shape.fieldtype ? " selected" : ""
                }>${opt}</option>`
            )
            .join("");
          const kindSelect = ["Field", "CutOut"]
            .map(
              (opt) =>
                `<option value="${opt}"${
                  opt === shape.kind ? " selected" : ""
                }>${opt}</option>`
            )
            .join("");
          return `
          <div class="shape-row">
            <span>ID: ${escapeHtml(shape.id)}</span>
            <label>
              Name
              <input
                type="text"
                class="triorb-shape-name"
                data-shape-index="${shapeIndex}"
                data-field="name"
                value="${escapeHtml(shape.name)}"
              />
            </label>
            <label>
              Fieldtype
              <select
                class="triorb-shape-fieldtype"
                data-shape-index="${shapeIndex}"
                data-field="fieldtype"
              >
                ${fieldtypeSelect}
              </select>
            </label>
            <label>
              Type
              <select
                class="triorb-shape-kind"
                data-shape-index="${shapeIndex}"
                data-field="kind"
              >
                ${kindSelect}
              </select>
            </label>
            <label>
              Geometry
              <select
                class="triorb-shape-type"
                data-shape-index="${shapeIndex}"
                data-field="type"
              >
                ${geometrySelect}
              </select>
            </label>
            <button
              type="button"
              class="inline-btn inline-danger shape-mini-btn"
              data-action="remove-triorb-shape"
              data-shape-index="${shapeIndex}"
            >
              Remove
            </button>
          </div>
              <div class="shape-details">${details}</div>`;
        }

        function renderTriOrbShapeDetails(shape, shapeIndex) {
          switch (shape.type) {
            case "Rectangle":
              return ["OriginX", "OriginY", "Width", "Height", "Rotation"]
                .map((key) => {
                  const value = shape.rectangle?.[key] ?? "0";
                  return `
                    <label>
                      ${key}
                      <input
                        type="number"
                        data-shape-index="${shapeIndex}"
                        data-field="${key}"
                        data-shape-dimension="rectangle"
                        value="${escapeHtml(value)}"
                      />
                    </label>`;
                })
                .join("");
            case "Circle":
              return ["CenterX", "CenterY", "Radius"]
                .map((key) => {
                  const value = shape.circle?.[key] ?? "0";
                  return `
                    <label>
                      ${key}
                      <input
                        type="number"
                        data-shape-index="${shapeIndex}"
                        data-field="${key}"
                        data-shape-dimension="circle"
                        value="${escapeHtml(value)}"
                      />
                    </label>`;
                })
                .join("");
            case "Polygon":
            default:
              return `
                <label>
                  Points (format: (x1,y1),(x2,y2),...)
                  <input
                    type="text"
                    data-shape-index="${shapeIndex}"
                    data-shape-dimension="polygon"
                    value="${escapeHtml(formatPolygonPoints(shape.polygon?.points || []))}"
                  />
                </label>`;
          }
        }

        function handleTriOrbShapeInput(event) {
          const target = event.target;
          if (!target) return;
          const shapeIndex = Number(target.dataset.shapeIndex);
          if (!Number.isFinite(shapeIndex)) {
            return;
          }
          const shape = triorbShapes[shapeIndex];
          if (!shape) return;
          const field = target.dataset.field;
          const dimension = target.dataset["shapeDimension"];
          let changed = false;
          if (field === "name") {
            shape.name = target.value;
            changed = true;
          } else if (field === "fieldtype") {
            shape.fieldtype = target.value;
            changed = true;
          } else if (field === "kind") {
            applyShapeKind(shape, target.value);
            changed = true;
          } else if (field === "type") {
            shape.type = target.value;
            if (shape.type === "Polygon") {
              shape.polygon = shape.polygon || createDefaultPolygonDetails();
            } else if (shape.type === "Rectangle") {
              shape.rectangle = shape.rectangle || createDefaultRectangleDetails();
            } else if (shape.type === "Circle") {
              shape.circle = shape.circle || createDefaultCircleDetails();
            }
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            applyShapeKind(shape, shape.kind || "Field");
            changed = true;
          } else if (dimension === "polygon") {
            if (!shape.polygon) {
              shape.polygon = createDefaultPolygonDetails();
            }
            shape.polygon.points = parsePolygonPoints(target.value);
            changed = true;
          } else if (dimension === "rectangle") {
            shape.rectangle = shape.rectangle || createDefaultRectangleDetails();
            shape.rectangle[field] = target.value;
            changed = true;
          } else if (dimension === "circle") {
            shape.circle = shape.circle || createDefaultCircleDetails();
            shape.circle[field] = target.value;
            changed = true;
          }
          if (changed) {
            invalidateTriOrbShapeCaches();
            renderFigure();
            renderFieldsets();
          }
        }

        function renderPolygonEditor(fieldsetIndex, fieldIndex, polygon, polygonIndex) {
          const typeSelect = renderShapeTypeSelect(
            "polygon",
            polygon.attributes?.Type || "CutOut",
            "polygon-type",
            {
              "fieldset-index": fieldsetIndex,
              "field-index": fieldIndex,
              "polygon-index": polygonIndex,
            }
          );
          const pointInputs = (polygon.points || [])
            .map(
              (point, pointIndex) => `
              <div class="shape-point" data-point-index="${pointIndex}">
                <label>X</label>
                <input
                  type="number"
                  class="polygon-point"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-polygon-index="${polygonIndex}"
                  data-point-index="${pointIndex}"
                  data-axis="X"
                  value="${escapeHtml(point.X ?? "0")}"
                />
                <label>Y</label>
                <input
                  type="number"
                  class="polygon-point"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-polygon-index="${polygonIndex}"
                  data-point-index="${pointIndex}"
                  data-axis="Y"
                  value="${escapeHtml(point.Y ?? "0")}"
                />
                <button
                  type="button"
                  class="inline-btn inline-danger shape-mini-btn"
                  data-action="remove-polygon-point"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-polygon-index="${polygonIndex}"
                  data-point-index="${pointIndex}"
                >
                  Remove
                </button>
              </div>`
            )
            .join("");
          return `
            <div class="shape-entry" data-shape="polygon">
              <div class="shape-title">
                <span>Polygon #${polygonIndex + 1}</span>
                <button
                  type="button"
                  class="inline-btn inline-danger shape-mini-btn"
                  data-action="remove-polygon"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-polygon-index="${polygonIndex}"
                >
                  Remove
                </button>
              </div>
              <div class="shape-fields">
                <label>Type</label>
                ${typeSelect}
              </div>
              <div class="shape-points">
                ${pointInputs || "<p>No points.</p>"}
              </div>
              <div class="shape-actions">
                <button
                  type="button"
                  class="inline-btn shape-mini-btn"
                  data-action="add-polygon-point"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-polygon-index="${polygonIndex}"
                >
                  Add Point
                </button>
              </div>
            </div>`;
        }

        function renderRectangleEditor(fieldsetIndex, fieldIndex, rectangle, rectangleIndex) {
          const typeSelect = renderShapeTypeSelect(
            "rectangle",
            rectangle.Type || "Field",
            "rectangle-type",
            {
              "fieldset-index": fieldsetIndex,
              "field-index": fieldIndex,
              "rectangle-index": rectangleIndex,
            }
          );
          const fields = ["OriginX", "OriginY", "Width", "Height", "Rotation"].map(
            (key) => `
              <div class="shape-field">
                <label>${key}</label>
                <input
                  type="number"
                  class="rectangle-attr"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-rectangle-index="${rectangleIndex}"
                  data-field="${key}"
                  value="${escapeHtml(rectangle[key] ?? "0")}"
                />
              </div>`
          );
          return `
            <div class="shape-entry" data-shape="rectangle">
              <div class="shape-title">
                <span>Rectangle #${rectangleIndex + 1}</span>
                <button
                  type="button"
                  class="inline-btn inline-danger shape-mini-btn"
                  data-action="remove-rectangle"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-rectangle-index="${rectangleIndex}"
                >
                  Remove
                </button>
              </div>
              <div class="shape-fields">
                <label>Type</label>
                ${typeSelect}
              </div>
              <div class="shape-grid">
                ${fields.join("")}
              </div>
            </div>`;
        }

        function renderCircleEditor(fieldsetIndex, fieldIndex, circle, circleIndex) {
          const typeSelect = renderShapeTypeSelect(
            "circle",
            circle.Type || "Field",
            "circle-type",
            {
              "fieldset-index": fieldsetIndex,
              "field-index": fieldIndex,
              "circle-index": circleIndex,
            }
          );
          const circleFields = ["CenterX", "CenterY", "Radius"].map(
            (key) => `
              <div class="shape-field">
                <label>${key}</label>
                <input
                  type="number"
                  class="circle-attr"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-circle-index="${circleIndex}"
                  data-field="${key}"
                  value="${escapeHtml(circle[key] ?? "0")}"
                />
              </div>`
          );
          return `
            <div class="shape-entry" data-shape="circle">
              <div class="shape-title">
                <span>Circle #${circleIndex + 1}</span>
                <button
                  type="button"
                  class="inline-btn inline-danger shape-mini-btn"
                  data-action="remove-circle"
                  data-fieldset-index="${fieldsetIndex}"
                  data-field-index="${fieldIndex}"
                  data-circle-index="${circleIndex}"
                >
                  Remove
                </button>
              </div>
              <div class="shape-fields">
                <label>Type</label>
                ${typeSelect}
              </div>
              <div class="shape-grid">
                ${circleFields.join("")}
              </div>
            </div>`;
        }

        function renderShapeTypeSelect(kind, currentValue, className, dataAttrs) {
          const options = new Set(shapeTypeOptions[kind] || []);
          if (currentValue) {
            options.add(currentValue);
          }
          const dataAttrString = Object.entries(dataAttrs || {})
            .map(([key, value]) => ` data-${key}="${escapeHtml(String(value))}"`)
            .join("");
          return `
            <select class="${className}"${dataAttrString}>
              ${Array.from(options)
                .map(
                  (option) =>
                    `<option value="${escapeHtml(option)}"${
                      option === currentValue ? " selected" : ""
                    }>${escapeHtml(option)}</option>`
                )
                .join("")}
            </select>`;
        }

        function updateFieldsetAttribute(fieldsetIndex, key, value) {
          const fieldset = fieldsets[fieldsetIndex];
          if (!fieldset) return;
          fieldset.attributes = fieldset.attributes || {};
          fieldset.attributes[key] = value;
          if (key === "Name") {
            const summary = document.querySelector(
              `.fieldset-card[data-fieldset-index="${fieldsetIndex}"] .fieldset-summary`
            );
            if (summary) {
              summary.textContent = value;
            }
          }
          invalidateFieldsetTraces();
          renderFigure();
        }

        function updateFieldAttribute(fieldsetIndex, fieldIndex, key, value) {
          const fieldset = fieldsets[fieldsetIndex];
          const field = fieldset?.fields?.[fieldIndex];
          if (!field) return;
          field.attributes[key] = value;
          if (key === "Name") {
            const summary = document.querySelector(
              `.field-card[data-fieldset-index="${fieldsetIndex}"][data-field-index="${fieldIndex}"] .field-summary`
            );
            if (summary) {
              summary.textContent = value;
            }
          }
          invalidateFieldsetTraces();
          renderFigure();
        }

        function updatePolygonAttribute(fieldsetIndex, fieldIndex, polygonIndex, key, value) {
          const fieldset = fieldsets[fieldsetIndex];
          const field = fieldset?.fields?.[fieldIndex];
          const polygon = field?.polygons?.[polygonIndex];
          if (!polygon) return;
          polygon.attributes = polygon.attributes || {};
          polygon.attributes[key] = value;
          renderFieldsets();
          renderFigure();
        }

        function updatePolygonPoint(fieldsetIndex, fieldIndex, polygonIndex, pointIndex, axis, value) {
          const fieldset = fieldsets[fieldsetIndex];
          const field = fieldset?.fields?.[fieldIndex];
          const polygon = field?.polygons?.[polygonIndex];
          if (!polygon || !polygon.points || !polygon.points[pointIndex]) {
            return;
          }
          polygon.points[pointIndex][axis] = value;
          renderFieldsets();
          renderFigure();
        }

        function updateRectangleAttribute(fieldsetIndex, fieldIndex, rectangleIndex, key, value) {
          const fieldset = fieldsets[fieldsetIndex];
          const field = fieldset?.fields?.[fieldIndex];
          const rectangle = field?.rectangles?.[rectangleIndex];
          if (!rectangle) return;
          rectangle[key] = value;
          renderFieldsets();
          renderFigure();
        }

        function updateCircleAttribute(fieldsetIndex, fieldIndex, circleIndex, key, value) {
          const fieldset = fieldsets[fieldsetIndex];
          const field = fieldset?.fields?.[fieldIndex];
          const circle = field?.circles?.[circleIndex];
          if (!circle) return;
          circle[key] = value;
          renderFieldsets();
          renderFigure();
        }

        function captureFieldsetDetailState() {
          if (!fieldsetsContainer) {
            return { fieldsets: new Set(), fields: new Set() };
          }
          const state = { fieldsets: new Set(), fields: new Set() };
          fieldsetsContainer.querySelectorAll(".fieldset-card").forEach((card) => {
            const fieldsetIndex = card.dataset.fieldsetIndex;
            const details = card.querySelector("details");
            if (details?.open && fieldsetIndex !== undefined) {
              state.fieldsets.add(fieldsetIndex);
            }
            card.querySelectorAll(".field-card").forEach((fieldCard) => {
              const fieldIndex = fieldCard.dataset.fieldIndex;
              const fieldDetails = fieldCard.querySelector("details");
              if (
                fieldDetails?.open &&
                fieldsetIndex !== undefined &&
                fieldIndex !== undefined
              ) {
                state.fields.add(`${fieldsetIndex}:${fieldIndex}`);
              }
            });
          });
          return state;
        }

        function restoreFieldsetDetailState(state) {
          if (!state || !fieldsetsContainer) {
            return;
          }
          fieldsetsContainer.querySelectorAll(".fieldset-card").forEach((card) => {
            const fieldsetIndex = card.dataset.fieldsetIndex;
            if (state.fieldsets.has(fieldsetIndex)) {
              const details = card.querySelector("details");
              if (details) {
                details.open = true;
              }
            }
            card.querySelectorAll(".field-card").forEach((fieldCard) => {
              const fieldIndex = fieldCard.dataset.fieldIndex;
              const key = `${fieldsetIndex}:${fieldIndex}`;
              if (state.fields.has(key)) {
                const details = fieldCard.querySelector("details");
                if (details) {
                  details.open = true;
                }
              }
            });
          });
        }

        function getFieldEntry(fieldsetIndex, fieldIndex) {
          const fieldset = fieldsets[fieldsetIndex];
          if (!fieldset || !fieldset.fields) {
            return null;
          }
          return fieldset.fields[fieldIndex] || null;
        }

        function addPolygon(fieldsetIndex, fieldIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field) return;
          field.polygons = field.polygons || [];
          field.polygons.push(createDefaultPolygon());
          renderFieldsets();
        }

        function removePolygon(fieldsetIndex, fieldIndex, polygonIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field || !field.polygons) return;
          field.polygons.splice(polygonIndex, 1);
          renderFieldsets();
        }

        function addPolygonPoint(fieldsetIndex, fieldIndex, polygonIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          const polygon = field?.polygons?.[polygonIndex];
          if (!polygon) return;
          polygon.points = polygon.points || [];
          polygon.points.push({ X: "0", Y: "0" });
          renderFieldsets();
        }

        function removePolygonPoint(fieldsetIndex, fieldIndex, polygonIndex, pointIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          const polygon = field?.polygons?.[polygonIndex];
          if (!polygon || !polygon.points) return;
          polygon.points.splice(pointIndex, 1);
          renderFieldsets();
        }

        function addCircle(fieldsetIndex, fieldIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field) return;
          field.circles = field.circles || [];
          field.circles.push(createDefaultCircle());
          renderFieldsets();
        }

        function removeCircle(fieldsetIndex, fieldIndex, circleIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field || !field.circles) return;
          field.circles.splice(circleIndex, 1);
          renderFieldsets();
        }

        function addRectangle(fieldsetIndex, fieldIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field) return;
          field.rectangles = field.rectangles || [];
          field.rectangles.push(createDefaultRectangle());
          renderFieldsets();
        }

        function removeRectangle(fieldsetIndex, fieldIndex, rectangleIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field || !field.rectangles) return;
          field.rectangles.splice(rectangleIndex, 1);
          renderFieldsets();
        }

        function resolveShape(meta) {
          if (!meta) return null;
          if (meta.isTriOrbShape) {
            let shapeIndex = Number.isInteger(meta.shapeIndex)
              ? meta.shapeIndex
              : getTriOrbShapeIndexById(meta.shapeId);
            if (shapeIndex < 0) {
              return findTriOrbShapeById(meta.shapeId);
            }
            meta.shapeIndex = shapeIndex;
            return triorbShapes[shapeIndex] || null;
          }
          const field = getFieldEntry(meta.fieldsetIndex, meta.fieldIndex);
          if (!field) {
            return null;
          }
          switch (meta.kind) {
            case "polygon":
              return field.polygons?.[meta.shapeIndex] || null;
            case "rectangle":
              return field.rectangles?.[meta.shapeIndex] || null;
            case "circle":
              return field.circles?.[meta.shapeIndex] || null;
            default:
              return null;
          }
        }

        function cloneShape(shape) {
          if (!shape) return null;
          return JSON.parse(JSON.stringify(shape));
        }

        function restoreShapeValues(target, source) {
          if (!target || !source) return;
          Object.keys(target).forEach((key) => {
            delete target[key];
          });
          Object.keys(source).forEach((key) => {
            target[key] = source[key];
          });
        }

        function renderShapeModal(meta) {
          const shape = resolveShape(meta);
          if (!shape) return;
          modalShapeMeta = meta;
          modalOriginalShape = cloneShape(shape);
          shapeModalTitle.textContent = `${meta.shapeType || meta.kind} Edit`;
          let html = "";
          if (meta.kind === "polygon") {
            const points = shape.points || [];
            html += points
              .map(
                (point, idx) => `
              <div class="modal-field">
                <label>Point ${idx + 1} X(mm)</label>
                <input type="number" data-point-index="${idx}" data-axis="X" value="${escapeHtml(
                  point.X ?? "0"
                )}" />
                <label>Point ${idx + 1} Y(mm)</label>
                <input type="number" data-point-index="${idx}" data-axis="Y" value="${escapeHtml(
                  point.Y ?? "0"
                )}" />
              </div>`
              )
              .join("");
          } else if (meta.kind === "rectangle") {
            ["OriginX", "OriginY", "Width", "Height", "Rotation"].forEach((key) => {
              html += `
              <div class="modal-field">
                <label>${key}(mm)</label>
                <input type="number" data-field="${key}" value="${escapeHtml(shape[key] ?? "0")}" />
              </div>`;
            });
          } else if (meta.kind === "circle") {
            ["CenterX", "CenterY", "Radius"].forEach((key) => {
              html += `
              <div class="modal-field">
                <label>${key}(mm)</label>
                <input type="number" data-field="${key}" value="${escapeHtml(shape[key] ?? "0")}" />
              </div>`;
            });
          }
          shapeModalBody.innerHTML = html;
          shapeModal.classList.add("active");
          shapeModal.setAttribute("aria-hidden", "false");
          ensureModalPosition();
        }

        function handleShapeModalInput(event) {
          if (!modalShapeMeta) {
            return;
          }
          const shape = resolveShape(modalShapeMeta);
          if (!shape) {
            return;
          }
          const input = event.target;
          if (!input) {
            return;
          }
          if (modalShapeMeta.kind === "polygon") {
            const pointIndex = Number(input.dataset.pointIndex);
            const axis = input.dataset.axis;
            if (Number.isFinite(pointIndex) && axis) {
              shape.points = shape.points || [];
              if (!shape.points[pointIndex]) {
                shape.points[pointIndex] = { X: "0", Y: "0" };
              }
              shape.points[pointIndex][axis] = input.value;
            }
          } else {
            const field = input.dataset.field;
            if (field) {
              shape[field] = input.value;
            }
          }
          renderFieldsets();
          renderFigure();
        }

        function closeShapeModal() {
          modalShapeMeta = null;
          modalOriginalShape = null;
          shapeModal.classList.remove("active");
          shapeModal.setAttribute("aria-hidden", "true");
        }

        function saveShapeModal() {
          if (!modalShapeMeta) {
            return;
          }
          const shape = resolveShape(modalShapeMeta);
          modalOriginalShape = cloneShape(shape);
          closeShapeModal();
        }

        function cancelShapeModal() {
          if (modalShapeMeta && modalOriginalShape) {
            const shape = resolveShape(modalShapeMeta);
            if (shape) {
              restoreShapeValues(shape, modalOriginalShape);
            }
          }
          renderFieldsets();
          renderFigure();
          closeShapeModal();
        }

        function ensureModalPosition() {
          if (shapeModalWindow) {
            shapeModalWindow.style.transform = `translate(${modalOffsetX}px, ${modalOffsetY}px)`;
          }
        }

        function startModalDrag(event) {
          if (!shapeModalWindow) return;
          isModalDragging = true;
          modalDragStartX = event.clientX;
          modalDragStartY = event.clientY;
          shapeModalWindow.style.transition = "none";
        }

        function updateModalDrag(event) {
          if (!isModalDragging) return;
          const dx = event.clientX - modalDragStartX;
          const dy = event.clientY - modalDragStartY;
          if (shapeModalWindow) {
            shapeModalWindow.style.transform = `translate(${modalOffsetX + dx}px, ${modalOffsetY + dy}px)`;
          }
        }

        function endModalDrag(event) {
          if (!isModalDragging) return;
          const dx = event.clientX - modalDragStartX;
          const dy = event.clientY - modalDragStartY;
          modalOffsetX += dx;
          modalOffsetY += dy;
          isModalDragging = false;
          if (shapeModalWindow) {
            shapeModalWindow.style.transition = "";
            ensureModalPosition();
          }
        }

        function formatAttributeBadges(attrs) {
          if (!attrs) {
            return "";
          }
          return Object.entries(attrs)
            .map(
              ([key, value]) =>
                `<span>${escapeHtml(key)}=${escapeHtml(value ?? "")}</span>`
            )
            .join("");
        }

        function initializeFieldsetDevices(data) {
          let devices;
          if (!Array.isArray(data) || !data.length) {
            devices = getDefaultFieldsetDevices();
          } else {
            devices = data.map((device, index) => {
              const attrs = { ...(device.attributes || {}) };
              if (!attrs.DeviceName) {
                const scanDeviceByName = findScanPlaneDeviceByName(attrs.DeviceName);
                if (scanDeviceByName?.attributes?.DeviceName) {
                  attrs.DeviceName = scanDeviceByName.attributes.DeviceName;
                } else {
                  const scanDevice = findScanPlaneDeviceByTypekey(attrs.Typekey);
                  if (scanDevice?.attributes?.DeviceName) {
                    attrs.DeviceName = scanDevice.attributes.DeviceName;
                  } else {
                    attrs.DeviceName = `Device ${index + 1}`;
                  }
                }
              }
              const wrapper = { attributes: attrs };
              applyScanPlaneDeviceAttributes(wrapper, {
                deviceName: attrs.DeviceName,
                typekey: attrs.Typekey,
              });
              return wrapper;
            });
          }
          ensureDefaultFieldsetDevices(devices);
          return devices;
        }

        function initializeGlobalGeometry(data) {
          if (!data || typeof data !== "object" || !Object.keys(data).length) {
            return { UseGlobalGeometry: "false" };
          }
          return { ...data };
        }

        function cloneGenericNode(node) {
          if (!node || typeof node !== "object") {
            return null;
          }
          const children = Array.isArray(node.children)
            ? node.children.map((child) => cloneGenericNode(child)).filter(Boolean)
            : [];
          return {
            tag: node.tag || "Node",
            attributes: { ...(node.attributes || {}) },
            text: typeof node.text === "string" ? node.text : "",
            children,
          };
        }

        function normalizeCasetableConfiguration(node) {
          const cloned = cloneGenericNode(node);
          if (cloned) {
            return cloned;
          }
          return createDefaultCasetableConfiguration();
        }

        function createDefaultCasetableConfiguration() {
          return { tag: "Configuration", attributes: {}, text: "", children: [] };
        }

        function normalizeCasetableLayout(layoutEntries) {
          const normalized = [];
          if (Array.isArray(layoutEntries)) {
            layoutEntries.forEach((entry) => {
              if (!entry || typeof entry !== "object") {
                return;
              }
              if (entry.kind === "node" && entry.node) {
                normalized.push({ kind: "node", node: cloneGenericNode(entry.node) });
              } else if (
                entry.kind === "configuration" ||
                entry.kind === "cases" ||
                entry.kind === "evals" ||
                entry.kind === "fields_configuration"
              ) {
                if (!normalized.some((item) => item.kind === entry.kind)) {
                  normalized.push({ kind: entry.kind });
                }
              }
            });
          }
          ["configuration", "cases", "evals", "fields_configuration"].forEach((kind) => {
            if (!normalized.some((entry) => entry.kind === kind)) {
              normalized.push({ kind });
            }
          });
          return normalized;
        }

        function normalizeCaseLayout(
          layoutEntries,
          staticInputs,
          speedActivation,
          placements = {}
        ) {
          const layout = [];
          const staticPlacement = placements.staticInputs || "case";
          const speedPlacement = placements.speedActivation || "case";
          if (Array.isArray(layoutEntries)) {
            layoutEntries.forEach((segment) => {
              if (!segment || typeof segment !== "object") {
                return;
              }
              if (segment.kind === "node" && segment.node) {
                layout.push({ kind: "node", node: cloneGenericNode(segment.node) });
              } else if (segment.kind === "static-inputs") {
                if (!layout.some((entry) => entry.kind === "static-inputs")) {
                  layout.push({ kind: "static-inputs" });
                }
              } else if (segment.kind === "speed-activation") {
                if (!layout.some((entry) => entry.kind === "speed-activation")) {
                  layout.push({ kind: "speed-activation" });
                }
              }
            });
          }
          if (
            staticInputs?.length &&
            staticPlacement !== "activation" &&
            !layout.some((entry) => entry.kind === "static-inputs")
          ) {
            layout.push({ kind: "static-inputs" });
          }
          if (
            speedActivation &&
            speedPlacement !== "activation" &&
            !layout.some((entry) => entry.kind === "speed-activation")
          ) {
            layout.push({ kind: "speed-activation" });
          }
          return layout;
        }

        function initializeCasetableCases(data) {
          if (!Array.isArray(data) || !data.length) {
            return [createDefaultCasetableCase(0)];
          }
          return data
            .slice(0, casetableCasesLimit)
            .map((entry, index) => normalizeCasetableCase(entry, index));
        }

        function normalizeCasetableCase(entry, index) {
          const attributes = { ...(entry?.attributes || {}) };
          if (!attributes.Name) {
            attributes.Name = buildCaseName(index);
          }
          if (!("DisplayOrder" in attributes)) {
            attributes.DisplayOrder = String(index);
          }
          const staticInputs = normalizeStaticInputs(entry?.static_inputs);
          const speedActivation = normalizeSpeedActivation(entry?.speed_activation);
          const staticInputsPlacement = entry?.static_inputs_placement || entry?.staticInputsPlacement || "case";
          const speedActivationPlacement =
            entry?.speed_activation_placement || entry?.speedActivationPlacement || "case";
          const activationMinSpeed = normalizeSpeedRangeValue(entry?.activationMinSpeed);
          const activationMaxSpeed = normalizeSpeedRangeValue(entry?.activationMaxSpeed);
          const layout = normalizeCaseLayout(entry?.layout, staticInputs, speedActivation, {
            staticInputs: staticInputsPlacement,
            speedActivation: speedActivationPlacement,
          });
          return {
            attributes,
            staticInputs,
            staticInputsPlacement,
            speedActivation,
            speedActivationPlacement,
            activationMinSpeed,
            activationMaxSpeed,
            layout,
          };
        }

        function buildCaseName(index) {
          return `Case ${index + 1}`;
        }

        function createSimpleTextNode(tag, text = "") {
          return { tag, attributes: {}, text, children: [] };
        }

        function createDefaultFollowingCasesNode() {
          return {
            tag: "FollowingCases",
            attributes: {},
            text: "",
            children: [
              {
                tag: "FollowingCase",
                attributes: {},
                text: "",
                children: [createSimpleTextNode("CaseIndex", "-1")],
              },
              {
                tag: "FollowingCase",
                attributes: {},
                text: "",
                children: [createSimpleTextNode("CaseIndex", "-1")],
              },
            ],
          };
        }

        function createDefaultActivationNode(caseIndex) {
          return {
            tag: "Activation",
            attributes: {},
            text: "",
            children: [
              { tag: "StaticInputs", attributes: {}, text: "", children: [] },
              createSimpleTextNode("StaticInputs1ofNIndex", "-1"),
              { tag: "SpeedActivation", attributes: {}, text: "", children: [] },
              createSimpleTextNode("MinSpeed", "0"),
              createSimpleTextNode("MaxSpeed", "0"),
              createSimpleTextNode("CaseNumber", String(caseIndex + 1)),
              createDefaultFollowingCasesNode(),
              createSimpleTextNode("SingleStepSequencePos", "-1"),
            ],
          };
        }

        function buildDefaultCaseLayout(caseIndex) {
          return [
            { kind: "node", node: createSimpleTextNode("SleepMode", "false") },
            { kind: "node", node: createSimpleTextNode("DisplayOrder", String(caseIndex)) },
            { kind: "node", node: createDefaultActivationNode(caseIndex) },
          ];
        }

        function createDefaultCasetableCase(index = 0) {
          const attributes = {
            Name: buildCaseName(index),
            DisplayOrder: String(index),
          };
          const staticInputs = normalizeStaticInputs();
          const speedActivation = normalizeSpeedActivation({
            attributes: { Mode: "Off" },
            mode_key: "Mode",
          });
          const layout = normalizeCaseLayout(
            buildDefaultCaseLayout(index),
            staticInputs,
            speedActivation,
            {
              staticInputs: "activation",
              speedActivation: "activation",
            }
          );
          return {
            attributes,
            staticInputs,
            staticInputsPlacement: "activation",
            speedActivation,
            speedActivationPlacement: "activation",
            activationMinSpeed: "0",
            activationMaxSpeed: "0",
            layout,
          };
        }

        function buildEvalName(index) {
          return `Eval ${index + 1}`;
        }

        function resolveEvalUserFieldOptions() {
          const userFieldDefinitions = collectUserFieldDefinitions({ includeStatFields: true });
          const options = userFieldDefinitions.map((definition) => {
            const label = formatUserFieldLabel(definition) || definition.id;
            return {
              value: definition.id,
              label: `#${definition.id} ${label}`,
            };
          });
          if (!options.length) {
            const fallbackOptions = evalUserFieldFallbackLabels.map((label, index) => {
              const value = String(index + 1);
              return { value, label: `#${value} ${label}`, isFallback: true };
            });
            return {
              options: fallbackOptions,
              values: new Set(fallbackOptions.map((option) => option.value)),
              defaultValue: fallbackOptions[0]?.value ?? "",
            };
          }
          return {
            options,
            values: new Set(options.map((option) => option.value)),
            defaultValue: options[0]?.value ?? "",
          };
        }

        function normalizeUserFieldIdValue(value) {
          const { values, defaultValue } = resolveEvalUserFieldOptions();
          const normalized = (value || "").trim();
          if (!normalized) {
            return defaultValue || "";
          }
          return values.has(normalized) ? normalized : defaultValue || "";
        }

        function buildEvalUserFieldOptionsHtml(selectedValue) {
          const { options, defaultValue } = resolveEvalUserFieldOptions();
          let value = selectedValue;
          if (!value && defaultValue) {
            value = defaultValue;
          }
          const hasSelection = options.some((option) => option.value === value);
          const unknownOption =
            !hasSelection && value
              ? `<option value="${escapeHtml(value)}" selected disabled>Unknown (#${escapeHtml(value)})</option>`
              : "";
          const optionHtml = options
            .map(
              (option) => `
                <option value="${escapeHtml(option.value)}"${
                  option.value === value ? " selected" : ""
                }>${escapeHtml(option.label)}</option>`
            )
            .join("");
          return { html: unknownOption + optionHtml, selectedValue: value };
        }

        function refreshEvalUserFieldOptions(selectElement) {
          if (!selectElement) {
            return;
          }
          const previousValue = selectElement.value;
          const { html, selectedValue } = buildEvalUserFieldOptionsHtml(previousValue);
          if (selectElement.innerHTML === html && previousValue === selectedValue) {
            return;
          }
          selectElement.innerHTML = html;
          selectElement.value = selectedValue;
          const evalIndex = Number(selectElement.dataset.evalIndex);
          const caseIndex = Number(selectElement.dataset.caseIndex);
          if (!Number.isFinite(evalIndex) || !Number.isFinite(caseIndex)) {
            applyEvalUserFieldValidation();
            return;
          }
          if (previousValue !== selectedValue) {
            updateEvalUserFieldId(evalIndex, caseIndex, selectedValue);
            refreshCaseFieldAssignments({ rerenderCaseToggles: true });
          }
          applyEvalUserFieldValidation();
        }

        function normalizeEvalReset(entry) {
          return {
            resetType: entry?.resetType ?? "NoReset",
            autoResetTime: entry?.autoResetTime ?? "0",
            evalResetSource: entry?.evalResetSource ?? "",
          };
        }

        function normalizePermanentPreset(entry) {
          const scanPlaneAttributes = { ...(entry?.scanPlaneAttributes || {}) };
          if (!("Id" in scanPlaneAttributes)) {
            scanPlaneAttributes.Id = "1";
          }
          return {
            scanPlaneAttributes,
            fieldMode: entry?.fieldMode ?? "59",
          };
        }

        function normalizeEvalCase(entry, caseIndex, defaults) {
          const optionDefaults = defaults || resolveEvalUserFieldOptions();
          const attributes = { ...(entry?.attributes || {}) };
          attributes.Id = String(caseIndex);
          const scanPlaneAttributes = { ...(entry?.scanPlane?.attributes || {}) };
          if (!("Id" in scanPlaneAttributes)) {
            scanPlaneAttributes.Id = "1";
          }
          const userFieldId = normalizeUserFieldIdValue(
            String(entry?.scanPlane?.userFieldId ?? "").trim() || optionDefaults.defaultValue
          );
          const isSplitted =
            String(entry?.scanPlane?.isSplitted ?? "false").toLowerCase() === "true"
              ? "true"
              : "false";
          return {
            attributes,
            scanPlane: {
              attributes: scanPlaneAttributes,
              userFieldId,
              isSplitted,
            },
          };
        }

        function createDefaultEvalCase(caseIndex, defaults) {
          return normalizeEvalCase(
            {
              attributes: { Id: String(caseIndex) },
              scanPlane: {
                attributes: { Id: "1" },
                userFieldId: "",
                isSplitted: "false",
              },
            },
            caseIndex,
            defaults
          );
        }

        function cloneEvalCase(evalCase) {
          if (!evalCase) {
            return null;
          }
          const attributes = { ...(evalCase.attributes || {}) };
          const scanPlaneAttributes = { ...(evalCase.scanPlane?.attributes || {}) };
          const userFieldId = normalizeUserFieldIdValue(evalCase.scanPlane?.userFieldId ?? "");
          const isSplitted =
            String(evalCase.scanPlane?.isSplitted ?? "false").toLowerCase() === "true"
              ? "true"
              : "false";
          return {
            attributes,
            scanPlane: {
              attributes: scanPlaneAttributes,
              userFieldId,
              isSplitted,
            },
          };
        }

        function normalizeEvalCases(list, caseCount, defaults) {
          const normalized = [];
          const safeCount = Math.max(1, caseCount || 0);
          if (Array.isArray(list) && list.length) {
            list.slice(0, safeCount).forEach((entry, index) => {
              normalized.push(normalizeEvalCase(entry, index, defaults));
            });
          }
          while (normalized.length < safeCount) {
            normalized.push(createDefaultEvalCase(normalized.length, defaults));
          }
          return normalized;
        }

        function normalizeEvalEntry(entry, evalIndex, caseCount, defaults) {
          const attributes = { ...(entry?.attributes || {}) };
          if (!attributes.Id) {
            attributes.Id = String(evalIndex + 1);
          }
          const cases = normalizeEvalCases(entry?.cases, caseCount, defaults);
          return {
            attributes,
            name: entry?.name ?? buildEvalName(evalIndex),
            nameLatin9Key:
              entry?.nameLatin9Key ?? `_EVAL_${String(evalIndex + 1).padStart(3, "0")}`,
            q: entry?.q ?? String(evalIndex + 1),
            reset: normalizeEvalReset(entry?.reset),
            cases,
            permanentPreset: normalizePermanentPreset(entry?.permanentPreset),
          };
        }

        function createDefaultEval(evalIndex, caseCount, defaults) {
          return normalizeEvalEntry(
            {
              attributes: { Id: String(evalIndex + 1) },
              name: buildEvalName(evalIndex),
              nameLatin9Key: `_EVAL_${String(evalIndex + 1).padStart(3, "0")}`,
              q: String(evalIndex + 1),
              reset: { resetType: "NoReset", autoResetTime: "0", evalResetSource: "" },
              cases: [],
              permanentPreset: { scanPlaneAttributes: { Id: "1" }, fieldMode: "59" },
            },
            evalIndex,
            caseCount,
            defaults
          );
        }

        function normalizeCasetableEvals(data, caseCount) {
          const attributes = { ...(data?.attributes || {}) };
          const safeCount = Math.max(1, caseCount || 0);
          const optionDefaults = resolveEvalUserFieldOptions();
          let evalEntries = [];
          if (Array.isArray(data?.evals) && data.evals.length) {
            evalEntries = data.evals
              .slice(0, casetableEvalsLimit)
              .map((entry, index) => normalizeEvalEntry(entry, index, safeCount, optionDefaults));
          }
          if (!evalEntries.length) {
            evalEntries = [createDefaultEval(0, safeCount, optionDefaults)];
          }
          return { attributes, evals: evalEntries };
        }

        function createDefaultStaticInput(name) {
          return {
            attributes: { Name: name || "StaticInput", Match: "DontCare" },
            valueKey: "Match",
          };
        }

        function resolveStaticInputValueKey(attrs) {
          const candidates = ["Value", "State", "Level", "Mode", "Match"];
          for (const candidate of candidates) {
            if (candidate in (attrs || {})) {
              return candidate;
            }
          }
          return "Value";
        }

        function resolveSpeedActivationKey(attrs) {
          const candidates = ["Mode", "Type", "State", "Value"];
          for (const candidate of candidates) {
            if (candidate in (attrs || {})) {
              return candidate;
            }
          }
          return "Mode";
        }

        function normalizeStaticInputs(list) {
          const desiredCount = 8;
          const sourceList = Array.isArray(list) ? list : [];
          const normalized = [];
          for (let index = 0; index < Math.min(sourceList.length, desiredCount); index += 1) {
            const item = sourceList[index] || {};
            const attributes = { ...(item.attributes || {}) };
            const displayIndex = normalized.length + 1;
            if (!attributes.Name) {
              attributes.Name = `StaticInput ${displayIndex}`;
            }
            const valueKey = item.value_key || resolveStaticInputValueKey(attributes);
            if (!(valueKey in attributes)) {
              attributes[valueKey] = "DontCare";
            }
            normalized.push({ attributes, valueKey });
          }
          while (normalized.length < desiredCount) {
            normalized.push(createDefaultStaticInput(`StaticInput ${normalized.length + 1}`));
          }
          return normalized;
        }

        function normalizeSpeedActivation(entry) {
          const attributes = { ...(entry?.attributes || {}) };
          const modeKey = entry?.mode_key || resolveSpeedActivationKey(attributes);
          if (!(modeKey in attributes)) {
            attributes[modeKey] = "Off";
          }
          return { attributes, modeKey };
        }

        function normalizeSpeedRangeValue(value) {
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            const clamped = Math.min(20000, Math.max(-20000, numeric));
            return String(clamped);
          }
          return "0";
        }

        function findCasetableConfigNode(path) {
          if (!path) {
            return null;
          }
          if (path === "root") {
            return casetableConfiguration;
          }
          const parts = path.split(".");
          let node = casetableConfiguration;
          for (let index = 1; index < parts.length; index += 1) {
            const childIndex = Number(parts[index]);
            if (Number.isNaN(childIndex) || !node?.children?.[childIndex]) {
              return null;
            }
            node = node.children[childIndex];
          }
          return node;
        }

        function ensureCasetableConfigurationRoot() {
          if (!casetableConfiguration || casetableConfiguration.tag !== "Configuration") {
            casetableConfiguration = createDefaultCasetableConfiguration();
          }
          casetableConfiguration.attributes = casetableConfiguration.attributes || {};
          if (typeof casetableConfiguration.text !== "string") {
            casetableConfiguration.text = "";
          }
          casetableConfiguration.children = Array.isArray(casetableConfiguration.children)
            ? casetableConfiguration.children
            : [];
          return casetableConfiguration;
        }

        function findCasetableConfigChildByTag(tag) {
          if (!tag) {
            return null;
          }
          const rootNode = ensureCasetableConfigurationRoot();
          return rootNode.children.find((child) => child?.tag === tag) || null;
        }

        function ensureCasetableConfigChildByTag(tag) {
          if (!tag) {
            return null;
          }
          const rootNode = ensureCasetableConfigurationRoot();
          let child = rootNode.children.find((entry) => entry?.tag === tag);
          if (!child) {
            child = { tag, attributes: {}, text: "", children: [] };
            rootNode.children.push(child);
          }
          child.attributes = child.attributes || {};
          if (typeof child.text !== "string") {
            child.text = "";
          }
          child.children = Array.isArray(child.children) ? child.children : [];
          return child;
        }

        function getCasetableConfigTextValue(tag, fallback = "") {
          const child = findCasetableConfigChildByTag(tag);
          if (!child) {
            return fallback;
          }
          if (typeof child.text !== "string" || !child.text.length) {
            return fallback;
          }
          return child.text;
        }

        function setCasetableConfigTextValue(tag, value) {
          const child = ensureCasetableConfigChildByTag(tag);
          if (child) {
            child.text = value ?? "";
          }
        }

        function getCasetableConfigBoolean(tag, fallback = false) {
          const child = findCasetableConfigChildByTag(tag);
          if (!child) {
            return fallback;
          }
          return isTrueValue(child.text);
        }

        function setCasetableConfigBoolean(tag, enabled) {
          const child = ensureCasetableConfigChildByTag(tag);
          if (child) {
            child.text = enabled ? "true" : "false";
          }
        }

        function createConfigurationStaticInputNode(ranking) {
          return {
            tag: "StaticInput",
            attributes: {},
            text: "",
            children: [
              { tag: "Ranking", attributes: {}, text: String(ranking), children: [] },
              { tag: "Evaluate", attributes: {}, text: "true", children: [] },
            ],
          };
        }

        function ensureConfigurationStaticInputChildNode(node, tag) {
          if (!node) {
            return null;
          }
          node.children = Array.isArray(node.children) ? node.children : [];
          let child = node.children.find((entry) => entry?.tag === tag);
          if (!child) {
            child = { tag, attributes: {}, text: "", children: [] };
            node.children.push(child);
          }
          child.attributes = child.attributes || {};
          child.children = Array.isArray(child.children) ? child.children : [];
          if (typeof child.text !== "string") {
            child.text = "";
          }
          return child;
        }

        function ensureConfigurationStaticInputStructure(node, ranking) {
          node.tag = "StaticInput";
          node.attributes = node.attributes || {};
          node.children = Array.isArray(node.children) ? node.children : [];
          node.text = typeof node.text === "string" ? node.text : "";
          const rankingChild = ensureConfigurationStaticInputChildNode(node, "Ranking");
          rankingChild.text = String(ranking);
          const evaluateChild = ensureConfigurationStaticInputChildNode(node, "Evaluate");
          if (!evaluateChild.text) {
            evaluateChild.text = "true";
          }
          return node;
        }

        function ensureCasetableConfigStaticInputs() {
          const staticInputsNode = ensureCasetableConfigChildByTag("StaticInputs");
          staticInputsNode.children = Array.isArray(staticInputsNode.children)
            ? staticInputsNode.children
            : [];
          const rankingMap = new Map();
          const extras = [];
          staticInputsNode.children.forEach((child) => {
            if (!child || child.tag !== "StaticInput") {
              extras.push(child);
              return;
            }
            const rankingChild = child.children?.find((entry) => entry.tag === "Ranking");
            const rankingValue = parseInt(rankingChild?.text ?? "", 10);
            if (
              Number.isFinite(rankingValue) &&
              rankingValue >= 1 &&
              rankingValue <= casetableConfigurationStaticInputsCount &&
              !rankingMap.has(rankingValue)
            ) {
              rankingMap.set(rankingValue, child);
            } else {
              extras.push(child);
            }
          });
          const normalized = [];
          for (let ranking = 1; ranking <= casetableConfigurationStaticInputsCount; ranking += 1) {
            let node = rankingMap.get(ranking);
            if (!node) {
              node = createConfigurationStaticInputNode(ranking);
            }
            normalized.push(ensureConfigurationStaticInputStructure(node, ranking));
          }
          staticInputsNode.children = [...normalized, ...extras];
          return normalized;
        }

        function readConfigurationStaticInputEvaluate(node) {
          if (!node) {
            return true;
          }
          const evaluateChild = node.children?.find((entry) => entry.tag === "Evaluate");
          return isTrueValue(evaluateChild?.text ?? "");
        }

        function setConfigurationStaticInputEvaluate(node, enabled) {
          if (!node) {
            return;
          }
          const evaluateChild = ensureConfigurationStaticInputChildNode(node, "Evaluate");
          if (evaluateChild) {
            evaluateChild.text = enabled ? "true" : "false";
          }
        }

        function updateConfigurationStaticInputEvaluate(index, enabled) {
          const staticInputs = ensureCasetableConfigStaticInputs();
          const target = staticInputs[index];
          if (!target) {
            return;
          }
          setConfigurationStaticInputEvaluate(target, enabled);
        }

        function updateCasetableConfigAttribute(path, field, value) {
          if (!field) {
            return;
          }
          const node = findCasetableConfigNode(path);
          if (!node) {
            return;
          }
          node.attributes = node.attributes || {};
          node.attributes[field] = value;
        }

        function updateCasetableConfigText(path, value) {
          const node = findCasetableConfigNode(path);
          if (!node) {
            return;
          }
          node.text = value;
        }

        function updateCaseAttribute(caseIndex, field, value) {
          const caseData = casetableCases[caseIndex];
          if (!caseData || !field) {
            return;
          }
          caseData.attributes[field] = value;
          if (field === "Name") {
            const summary = casetableCasesContainer?.querySelector(
              `.casetable-case-card[data-case-index="${caseIndex}"] .casetable-case-summary`
            );
            if (summary) {
              summary.textContent = value || buildCaseName(caseIndex);
            }
            updateEvalCaseLabels(caseIndex, value);
          }
        }

        function updateEvalCaseLabels(caseIndex, value) {
          if (!casetableEvalsContainer) {
            return;
          }
          const labelNodes = casetableEvalsContainer.querySelectorAll(
            `.casetable-eval-case[data-case-index="${caseIndex}"] .casetable-eval-case-summary`
          );
          labelNodes.forEach((node) => {
            node.textContent = value || buildCaseName(caseIndex);
          });
        }

        function updateEvalSummaryLabel(evalIndex, value) {
          if (!casetableEvalsContainer) {
            return;
          }
          const summary = casetableEvalsContainer.querySelector(
            `.casetable-eval-card[data-eval-index="${evalIndex}"] .casetable-eval-summary`
          );
          if (summary) {
            summary.textContent = value || buildEvalName(evalIndex);
          }
        }

        function updateEvalAttribute(evalIndex, field, value) {
          const evalEntry = casetableEvals?.evals?.[evalIndex];
          if (!evalEntry || !field) {
            return;
          }
          evalEntry.attributes = evalEntry.attributes || {};
          evalEntry.attributes[field] = value;
        }

        function updateEvalBasicField(evalIndex, field, value) {
          const evalEntry = casetableEvals?.evals?.[evalIndex];
          if (!evalEntry || !field) {
            return;
          }
          evalEntry[field] = value;
          if (field === "name") {
            updateEvalSummaryLabel(evalIndex, value);
          }
        }

        function updateEvalResetField(evalIndex, field, value) {
          const evalEntry = casetableEvals?.evals?.[evalIndex];
          if (!evalEntry || !field) {
            return;
          }
          evalEntry.reset = evalEntry.reset || normalizeEvalReset(null);
          evalEntry.reset[field] = value;
        }

        function updateEvalFieldMode(evalIndex, value) {
          const evalEntry = casetableEvals?.evals?.[evalIndex];
          if (!evalEntry) {
            return;
          }
          evalEntry.permanentPreset = evalEntry.permanentPreset || normalizePermanentPreset(null);
          evalEntry.permanentPreset.fieldMode = value;
        }

        function updateEvalUserFieldId(evalIndex, caseIndex, value) {
          const evalEntry = casetableEvals?.evals?.[evalIndex];
          const caseEntry = evalEntry?.cases?.[caseIndex];
          if (!caseEntry) {
            return;
          }
          caseEntry.scanPlane = caseEntry.scanPlane || {
            attributes: { Id: "1" },
            userFieldId: "",
            isSplitted: "false",
          };
          caseEntry.scanPlane.userFieldId = normalizeUserFieldIdValue(value);
          applyEvalUserFieldValidation();
        }

        function updateEvalSplitValue(evalIndex, caseIndex, value) {
          const evalEntry = casetableEvals?.evals?.[evalIndex];
          const caseEntry = evalEntry?.cases?.[caseIndex];
          if (!caseEntry) {
            return;
          }
          caseEntry.scanPlane = caseEntry.scanPlane || {
            attributes: { Id: "1" },
            userFieldId: "",
            isSplitted: "false",
          };
          caseEntry.scanPlane.isSplitted = value === "true" ? "true" : "false";
        }

        function updateStaticInputValue(caseIndex, staticIndex, value) {
          const caseData = casetableCases[caseIndex];
          if (!caseData) {
            return;
          }
          const staticEntry = caseData.staticInputs?.[staticIndex];
          if (!staticEntry) {
            return;
          }
          const normalizedValue = typeof value === "string" ? value : String(value ?? "");
          const lowerValue = normalizedValue.toLowerCase();
          const allowedValues = {
            dontcare: "DontCare",
            low: "Low",
            high: "High",
          };
          if (!(lowerValue in allowedValues)) {
            return;
          }
          const key = staticEntry.valueKey || resolveStaticInputValueKey(staticEntry.attributes || {});
          staticEntry.valueKey = key;
          staticEntry.attributes[key] = allowedValues[lowerValue];
        }

        function updateSpeedActivationValue(caseIndex, value) {
          const caseData = casetableCases[caseIndex];
          if (!caseData || !caseData.speedActivation) {
            return null;
          }
          const normalizedValue = typeof value === "string" ? value.trim() : "";
          const allowedValues = {
            off: "Off",
            speedrange: "SpeedRange",
          };
          const resolvedValue = allowedValues[normalizedValue.toLowerCase()] || "Off";
          const key =
            caseData.speedActivation.modeKey ||
            resolveSpeedActivationKey(caseData.speedActivation.attributes || {});
          caseData.speedActivation.modeKey = key;
          caseData.speedActivation.attributes[key] = resolvedValue;
          return resolvedValue;
        }

        function getCaseSpeedRangeValue(caseData, field) {
          if (!caseData) {
            return "0";
          }
          const key = field === "max" ? "activationMaxSpeed" : "activationMinSpeed";
          const rawValue = caseData[key];
          if (typeof rawValue === "number") {
            return String(rawValue);
          }
          if (typeof rawValue === "string" && rawValue.length) {
            return rawValue;
          }
          return "0";
        }

        function updateCaseSpeedRange(caseIndex, field, value) {
          const caseData = casetableCases[caseIndex];
          if (!caseData) {
            return null;
          }
          const normalizedValue = normalizeSpeedRangeValue(value);
          if (field === "max") {
            caseData.activationMaxSpeed = normalizedValue;
          } else {
            caseData.activationMinSpeed = normalizedValue;
          }
          return normalizedValue;
        }

        function createDefaultFieldsetDevice(index = 0, overrides = {}) {
          const options = getScanPlaneDeviceOptions();
          const fallbackOption =
            options[Math.min(index, Math.max(0, options.length - 1))] ||
            options[0];
          const defaultTypekey =
            fallbackOption?.typekey || "NANS3-CAAZ30ZA1P02";
          const optionLabel = (fallbackOption?.label || "").trim();
          const optionName = optionLabel.includes("(")
            ? optionLabel.split("(")[0].trim()
            : optionLabel;
          const templateName =
            defaultFieldsetDeviceTemplates[index]?.DeviceName || "";
          const resolvedName =
            overrides.DeviceName ||
            optionName ||
            templateName ||
            `Device ${index + 1}`;
          const device = {
            attributes: {
              DeviceName: resolvedName,
              Typekey: defaultTypekey,
              TypekeyVersion: fallbackOption?.typekeyVersion || "1.0",
              TypekeyDisplayVersion:
                fallbackOption?.typekeyDisplayVersion || "V 1.0.0",
              PositionX: "0",
              PositionY: "0",
              Rotation: "0",
              StandingUpsideDown: "false",
              ...overrides,
            },
          };
          applyScanPlaneDeviceAttributes(device, {
            deviceName: resolvedName,
            typekey: defaultTypekey,
          });
          return device;
        }

        function getDefaultFieldsetDevices() {
          if (!defaultFieldsetDeviceTemplates.length) {
            return [createDefaultFieldsetDevice(0)];
          }
          return defaultFieldsetDeviceTemplates.map((template, index) =>
            createDefaultFieldsetDevice(index, template)
          );
        }

        function ensureDefaultFieldsetDevices(devices) {
          if (!Array.isArray(devices)) {
            return;
          }
          defaultFieldsetDeviceTemplates.forEach((template) => {
            const exists = devices.some(
              (device) =>
                device.attributes?.PositionX === template.PositionX &&
                device.attributes?.PositionY === template.PositionY &&
                device.attributes?.Rotation === template.Rotation
            );
            if (!exists) {
              devices.push(createDefaultFieldsetDevice(devices.length, template));
            }
          });
        }

        function renderFieldsetDevices() {
          invalidateDeviceTraceCache();
          if (!fieldsetDevicesContainer) return;
          if (!fieldsetDevices.length) {
            fieldsetDevicesContainer.innerHTML = "<p>No devices defined.</p>";
            return;
          }
          const deviceOptions = getScanPlaneDeviceOptions();
          const canRemoveDevice = fieldsetDevices.length > 1;
          fieldsetDevicesContainer.innerHTML = fieldsetDevices
            .map((device, deviceIndex) => {
              const attributeEntries = Object.entries(device.attributes || {});
              const deviceFields = attributeEntries
                .map(([key, value]) => {
                  if (key === "DeviceName") {
                    const selectionExists = deviceOptions.some(
                      (opt) => opt.deviceName === value
                    );
                    const optionsHtml =
                      '<option value="">-- Select Device --</option>' +
                      (deviceOptions.length
                        ? deviceOptions
                            .map(
                              (opt) =>
                                `<option value="${escapeHtml(opt.deviceName)}"${
                                  opt.deviceName === value ? " selected" : ""
                                }>${escapeHtml(opt.label)}</option>`
                            )
                            .join("")
                        : "");
                    const fallbackOption =
                      !selectionExists && value
                        ? `<option value="${escapeHtml(value)}" selected>${escapeHtml(
                            value
                          )}</option>`
                        : "";
                    return `
              <div class="device-field">
                <label>DeviceName</label>
                <select
                  class="fieldset-device-name"
                  data-device-index="${deviceIndex}"
                >
                  ${optionsHtml}${fallbackOption}
                </select>
              </div>`;
                  }
                  if (key === "Typekey") {
                    return `
              <div class="device-field">
                <label>${escapeHtml(key)}</label>
                <input type="text" value="${escapeHtml(value ?? "")}" readonly />
              </div>`;
                  }
                  if (["TypekeyDisplayVersion", "TypekeyVersion"].includes(key)) {
                    return `
              <div class="device-field">
                <label>${escapeHtml(key)}</label>
                <input type="text" value="${escapeHtml(value ?? "")}" readonly />
              </div>`;
                  }
                  return `
              <div class="device-field">
                <label>${escapeHtml(key)}</label>
                ${renderStructureInput("fieldsetDevice", key, value, {
                  className: "fieldset-device-attr",
                  dataset: { "device-index": deviceIndex, field: key },
                  name: `fieldset-device-${deviceIndex}-${key}`,
                })}
              </div>`;
                })
                .join("");

              return `
            <div class="device-card" data-fieldset-device-index="${deviceIndex}">
              <details class="device-details">
                <summary>
                  <span>Device #${deviceIndex + 1}</span>
                  <span class="device-summary">${device.attributes.Typekey || ""}</span>
                  <button
                    type="button"
                    class="inline-btn inline-danger"
                    data-action="remove-fieldset-device"
                    data-device-index="${deviceIndex}"
                    ${canRemoveDevice ? "" : "disabled"}
                  >
                    Remove
                  </button>
                </summary>
                <div class="device-fields">${deviceFields}</div>
              </details>
            </div>`;
            })
            .join("");
        }

        function renderFieldsetGlobal() {
          if (!fieldsetGlobalContainer) return;
          const entries =
            Object.entries(fieldsetGlobalGeometry || {}).length > 0
              ? Object.entries(fieldsetGlobalGeometry)
              : [["UseGlobalGeometry", "false"]];
          fieldsetGlobalContainer.innerHTML = entries
            .map(([key, value]) => {
              const control = renderStructureInput("fieldsetGlobal", key, value, {
                className: "fieldset-global-attr",
                dataset: { field: key },
                name: `fieldset-global-${key}`,
              });
              return `
          <div class="fieldset-field">
            <label>${escapeHtml(key)}</label>
            ${control}
          </div>`;
            })
            .join("");
        }

        function updateFieldsetDeviceAttribute(deviceIndex, key, value) {
          const device = fieldsetDevices[deviceIndex];
          if (!device) return;
          device.attributes[key] = value;
          if (key === "Typekey") {
            const summary = document.querySelector(
              `.device-card[data-fieldset-device-index="${deviceIndex}"] .device-summary`
            );
            if (summary) {
              summary.textContent = value;
            }
          }
          invalidateDeviceTraceCache();
          renderFigure();
        }

        function updateGlobalGeometryAttribute(key, value) {
          fieldsetGlobalGeometry[key] = value;
        }

        function buildBaseSdImportExportLines({
          scanDeviceAttrs = null,
          fieldsetDeviceAttrs = null,
          includeUserFieldIds = true,
          deviceIndexStrategy = "zero",
        } = {}) {
          normalizeScanPlaneDeviceIndexes(deviceIndexStrategy);
          // TriOrb Shapes やフィールド参照は UI 操作で逐次変化するため、
          // 保存直前にレジストリを再構築して ID → Shape の引き当て漏れを防ぐ。
          rebuildTriOrbShapeRegistry();

          const figure = currentFigure || defaultFigure;
          const fileInfoLines = buildFileInfoLines();
          const scanPlaneLines = buildScanPlanesXml(scanDeviceAttrs, {
            deviceIndexStrategy,
          });
          const fieldsetLines = buildFieldsetsXml(fieldsetDeviceAttrs, {
            includeUserFieldIds,
          });
          const casetableLines = buildCasetablesXml();
          const rootAttrOverrides = {
            ...rootAttributes,
            Timestamp: new Date().toISOString(),
            "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
          };
          const rootAttrText = buildRootAttributes(
            rootAttrOverrides,
            getAttributeOrder("SdImportExport")
          );
          const lines = [
            '<?xml version="1.0" encoding="utf-8"?>',
            rootAttrText ? `<SdImportExport ${rootAttrText}>` : "<SdImportExport>",
            "  <FileInfo>",
            ...fileInfoLines,
            "  </FileInfo>",
            "  <Export_ScanPlanes>",
            ...scanPlaneLines,
            "  </Export_ScanPlanes>",
            "  <Export_FieldsetsAndFields>",
            ...fieldsetLines,
            "  </Export_FieldsetsAndFields>",
            ...casetableLines,
            "</SdImportExport>",
          ];
          return lines;
        }

        function normalizeScanPlaneDeviceIndexes(strategy = "zero") {
          scanPlanes.forEach((plane) => {
            (plane.devices || []).forEach((device, deviceIndex) => {
              if (!device || typeof device !== "object") {
                return;
              }
              const attrs = device.attributes || {};
              if (strategy === "sequential") {
                attrs.Index = String(deviceIndex);
              } else if (strategy === "zero") {
                attrs.Index = "0";
              }
              device.attributes = attrs;
            });
          });
        }

        function buildLegacyXml() {
          const lines = buildBaseSdImportExportLines({
            includeUserFieldIds: false,
          });
          return lines.join("\n");
        }

        function buildTriOrbXml() {
          const lines = buildBaseSdImportExportLines({
            deviceIndexStrategy: "sequential",
          }).slice();
          lines.push("");
          if (!triorbSource) {
            triorbSource = "TriOrbAware";
          }
          const sourceAttr = triorbSource
            ? ` Source="${escapeXml(triorbSource)}"`
            : "";
          lines.push(`<TriOrb_SICK_SLS_Editor${sourceAttr}>`);
          lines.push("  <PlotlyData>");
          lines.push("    <Traces>");

          const figure = currentFigure || defaultFigure;
          (figure.data || []).forEach((trace, index) => {
            const name = escapeXml(trace?.name ?? `Trace ${index + 1}`);
            const mode = escapeXml(trace?.mode ?? "lines");
            lines.push(`      <Trace Name="${name}" Mode="${mode}">`);
            const len = Math.min(trace.x?.length || 0, trace.y?.length || 0);
            for (let i = 0; i < len; i += 1) {
              lines.push(`        <Point X="${trace.x[i]}" Y="${trace.y[i]}" />`);
            }
            lines.push("      </Trace>");
          });

          lines.push("    </Traces>");
          lines.push("  </PlotlyData>");
          lines.push("  <TriOrbMenu>");
          lines.push(
            `    <Device FieldOfView="${escapeXml(String(fieldOfViewDegrees || "270"))}" />`
          );
          lines.push(
            `    <Field MultipleSampling="${escapeXml(
              String(globalMultipleSampling || "2")
            )}">`
          );
          lines.push("      <CommonCutOut Name=\"CommonCutOut #1\">");
          lines.push("        <Polygon Name=\"Polygon #1\" />");
          lines.push("        <Circle Name=\"Circle #1\" />");
          lines.push("        <Rectangle Name=\"Rectangle #1\" />");
          lines.push("      </CommonCutOut>");
          lines.push("    </Field>");
          const shapeLines = buildTriOrbShapesXml();
          shapeLines.forEach((line) => lines.push(line));
          lines.push("  </TriOrbMenu>");
          lines.push("</TriOrb_SICK_SLS_Editor>");
          return lines.join("\n");
        }

        function buildDeviceAttributeString(
          attrs,
          {
            keepDeviceName = false,
            includeIndex = true,
            deviceIndex = 0,
            deviceIndexStrategy = "zero",
          } = {}
        ) {
          if (!attrs) return "";
          const sanitized = { ...attrs };
          if (includeIndex) {
            if (deviceIndexStrategy === "sequential") {
              sanitized.Index = String(deviceIndex ?? 0);
            } else if (deviceIndexStrategy === "preserve" && attrs.Index !== undefined) {
              sanitized.Index = String(attrs.Index);
            } else {
              sanitized.Index = "0";
            }
          } else {
            delete sanitized.Index;
          }
          if (!keepDeviceName) {
            delete sanitized.DeviceName;
          }
          return buildAttributeString(sanitized, getAttributeOrder("Device"));
        }

        function formatDeviceFilePrefix(attrs, index) {
          const rawName = (attrs?.DeviceName || "").trim() || attrs?.Typekey || `device${index + 1}`;
          return rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
        }

        function buildScanPlanesXml(
          scanDeviceAttrs = null,
          { deviceIndexStrategy = "zero" } = {}
        ) {
          if (!scanPlanes.length) {
            return ["    <!-- ScanPlane not set -->"];
          }
          const lines = [];
          scanPlanes.forEach((plane) => {
            const attrText = buildAttributeString(
              plane.attributes,
              getAttributeOrder("ScanPlane")
            );
            lines.push(`    <ScanPlane${attrText ? " " + attrText : ""}>`);
            const devicesToRender = scanDeviceAttrs
              ? [{ attributes: scanDeviceAttrs }]
              : plane.devices || [];
            lines.push("      <Devices>");
            if (devicesToRender.length) {
              devicesToRender.forEach((device, deviceIndex) => {
                const attrs = buildDeviceAttributeString(device.attributes, {
                  keepDeviceName: true,
                  deviceIndex,
                  deviceIndexStrategy,
                });
                lines.push(`        <Device${attrs ? " " + attrs : ""} />`);
              });
            } else {
              lines.push("        <!-- No devices -->");
            }
            lines.push("      </Devices>");
            lines.push("    </ScanPlane>");
          });
          return lines;
        }

        function mergeFieldsByAttributes(fields = []) {
          const merged = [];
          const map = new Map();
          fields
            .filter((field) => field && typeof field === "object")
            .forEach((field) => {
              const normalizedAttrs = stripLatin9Key(field.attributes) || {};
              const { Type: _ignoreType, ...restAttrs } = normalizedAttrs;
              const orderedAttrs = Object.keys(restAttrs)
                .sort()
                .reduce((acc, key) => {
                  acc[key] = restAttrs[key];
                  return acc;
                }, {});
              const key = JSON.stringify({ attrs: orderedAttrs });
              if (!map.has(key)) {
                map.set(key, {
                  attributes: { ...orderedAttrs },
                  polygons: [],
                  circles: [],
                  rectangles: [],
                  shapeRefs: [],
                });
                merged.push(map.get(key));
              }
              const target = map.get(key);
              if (Array.isArray(field.polygons)) {
                target.polygons.push(...field.polygons);
              }
              if (Array.isArray(field.circles)) {
                target.circles.push(...field.circles);
              }
              if (Array.isArray(field.rectangles)) {
                target.rectangles.push(...field.rectangles);
              }
              if (Array.isArray(field.shapeRefs)) {
                target.shapeRefs.push(...field.shapeRefs);
              }
            });
          return merged;
        }

        function buildFieldsetsXml(fieldsetDeviceAttrs = null, { includeUserFieldIds = true } = {}) {
          const lines = [];
          lines.push('    <ScanPlane Index="0">');

          lines.push("      <Devices>");
          const devicesToRender = fieldsetDeviceAttrs
            ? [{ attributes: fieldsetDeviceAttrs }]
            : fieldsetDevices;
          if (devicesToRender && devicesToRender.length) {
            devicesToRender.forEach((device) => {
              const deviceAttrs = buildDeviceAttributeString(device.attributes, {
                keepDeviceName: false,
                includeIndex: false,
              });
              lines.push(`        <Device${deviceAttrs ? " " + deviceAttrs : ""} />`);
            });
          } else {
            lines.push("        <!-- No devices -->");
          }
          lines.push("      </Devices>");

          const globalAttr = buildAttributeString(
            fieldsetGlobalGeometry,
            getAttributeOrder("GlobalGeometry")
          );
          lines.push(
            globalAttr
              ? `      <GlobalGeometry ${globalAttr} />`
              : "      <GlobalGeometry />"
          );

          lines.push("      <Fieldsets>");
          const writeInlineGeometry = (field) => {
            let wrote = false;
            (field.polygons || []).forEach((polygon) => {
              const polygonAttr = buildAttributeString(
                polygon.attributes || { Type: polygon.Type || "Field" },
                getAttributeOrder("Polygon")
              );
              lines.push(
                `          <Polygon${polygonAttr ? " " + polygonAttr : ""}>`
              );
              (polygon.points || []).forEach((point) => {
                const pointAttrs = buildAttributeString(
                  sanitizePointAttributes(point),
                  getAttributeOrder("Point")
                );
                lines.push(
                  `            <Point${pointAttrs ? " " + pointAttrs : ""} />`
                );
              });
              lines.push("          </Polygon>");
              wrote = true;
            });
            (field.circles || []).forEach((circle) => {
              const circleAttrs = buildAttributeString(
                sanitizeCircleAttributes(circle),
                getAttributeOrder("Circle")
              );
              lines.push(
                `          <Circle${circleAttrs ? " " + circleAttrs : ""} />`
              );
              wrote = true;
            });
            (field.rectangles || []).forEach((rectangle) => {
              const rectAttrs = buildAttributeString(
                rectangle,
                getAttributeOrder("Rectangle")
              );
              lines.push(
                `          <Rectangle${rectAttrs ? " " + rectAttrs : ""} />`
              );
              wrote = true;
            });
            return wrote;
          };

          if (fieldsets.length) {
            fieldsets.forEach((fieldset) => {
              const attrText = buildAttributeString(
                stripLatin9Key(fieldset.attributes),
                getAttributeOrder("Fieldset")
              );
              lines.push(`        <Fieldset${attrText ? " " + attrText : ""}>`);
              const mergedFields = mergeFieldsByAttributes(fieldset.fields || []);
              if (mergedFields.length) {
                mergedFields.forEach((field) => {
                  const hasInlineGeometry =
                    (Array.isArray(field.polygons) && field.polygons.length > 0) ||
                    (Array.isArray(field.circles) && field.circles.length > 0) ||
                    (Array.isArray(field.rectangles) && field.rectangles.length > 0);
                  const shapeRefs = Array.isArray(field.shapeRefs)
                    ? field.shapeRefs
                        .map((shapeRef) =>
                          findTriOrbShapeById(shapeRef.shapeId) ||
                          triorbShapes.find((shape) => shape.id === shapeRef.shapeId)
                        )
                        .filter(Boolean)
                    : [];

                  if (
                    Array.isArray(field.shapeRefs) &&
                    field.shapeRefs.length > 0 &&
                    shapeRefs.length === 0
                  ) {
                    const requestedIds = field.shapeRefs
                      .map((ref) => ref.shapeId)
                      .filter(Boolean);
                    console.warn(
                      "フィールドに割り当てられたShapeを解決できません。XMLに出力されない可能性があります。",
                      {
                        fieldAttributes: field.attributes,
                        requestedShapeIds: requestedIds,
                        availableShapeIds: triorbShapes.map((shape) => shape.id),
                      }
                    );
                  }

                  if (!hasInlineGeometry && shapeRefs.length === 0) {
                    return;
                  }

                  const fieldAttributes = includeUserFieldIds
                    ? field.attributes
                    : (() => {
                        const attrs = { ...(field.attributes || {}) };
                        delete attrs.UserFieldId;
                        return attrs;
                      })();
                  const fieldAttrs = buildAttributeString(
                    fieldAttributes,
                    getAttributeOrder("Field")
                  );
                  lines.push(`          <Field${fieldAttrs ? " " + fieldAttrs : ""}>`);
                  let wroteShape = false;
                  if (shapeRefs.length) {
                    const orderedShapes = { Polygon: [], Circle: [], Rectangle: [] };
                    shapeRefs.forEach((shape) => {
                      const typeKey = shape.type === "Circle"
                        ? "Circle"
                        : shape.type === "Rectangle"
                        ? "Rectangle"
                        : "Polygon";
                      orderedShapes[typeKey].push(shape);
                    });

                    ["Polygon", "Circle", "Rectangle"].forEach((typeKey) => {
                      orderedShapes[typeKey].forEach((shape) => {
                        if (shape.type === "Polygon" && shape.polygon) {
                          const polygonAttr = buildAttributeString(
                            { Type: getPolygonTypeValue(shape.polygon) },
                            getAttributeOrder("Polygon")
                          );
                          lines.push(
                            `            <Polygon${polygonAttr ? " " + polygonAttr : ""}>`
                          );
                          (shape.polygon.points || []).forEach((point) => {
                            const pointAttrs = buildAttributeString(
                              sanitizePointAttributes(point),
                              getAttributeOrder("Point")
                            );
                            lines.push(
                              `              <Point${pointAttrs ? " " + pointAttrs : ""} />`
                            );
                          });
                          lines.push("            </Polygon>");
                          wroteShape = true;
                        } else if (shape.type === "Circle" && shape.circle) {
                          const circleAttrs = buildAttributeString(
                            sanitizeCircleAttributes(shape.circle),
                            getAttributeOrder("Circle")
                          );
                          lines.push(
                            `            <Circle${circleAttrs ? " " + circleAttrs : ""} />`
                          );
                          wroteShape = true;
                        } else if (shape.type === "Rectangle" && shape.rectangle) {
                          const rectAttrs = buildAttributeString(
                            shape.rectangle,
                            getAttributeOrder("Rectangle")
                          );
                          lines.push(
                            `            <Rectangle${rectAttrs ? " " + rectAttrs : ""} />`
                          );
                          wroteShape = true;
                        }
                      });
                    });
                  }

                  if (!wroteShape && hasInlineGeometry) {
                    wroteShape = writeInlineGeometry(field);
                  }
                  lines.push("          </Field>");
                });
              } else {
                lines.push("          <!-- No fields -->");
              }
              lines.push("        </Fieldset>");
            });
          } else {
            lines.push("        <!-- No fieldsets -->");
          }
          lines.push("      </Fieldsets>");
          lines.push("    </ScanPlane>");
          return lines;
        }

        function buildGenericNodeLines(node, indentLevel = 0) {
          if (!node || !node.tag) {
            return [];
          }
          const indent = "  ".repeat(indentLevel);
          const attrText = buildRootAttributes(node.attributes, getAttributeOrder(node.tag));
          const hasChildren = Array.isArray(node.children) && node.children.length;
          const hasText = typeof node.text === "string" && node.text.length;
          if (!hasChildren && !hasText) {
            return [`${indent}<${sanitizeTagName(node.tag)}${attrText ? ` ${attrText}` : ""} />`];
          }
          if (hasText && !hasChildren) {
            return [
              `${indent}<${sanitizeTagName(node.tag)}${attrText ? ` ${attrText}` : ""}>${escapeXml(
                node.text
              )}</${sanitizeTagName(node.tag)}>`
            ];
          }
          const lines = [
            `${indent}<${sanitizeTagName(node.tag)}${attrText ? ` ${attrText}` : ""}>`,
          ];
          if (hasText) {
            lines.push(`${indent}  ${escapeXml(node.text)}`);
          }
          if (hasChildren) {
            node.children.forEach((child) => {
              lines.push(...buildGenericNodeLines(child, indentLevel + 1));
            });
          }
          lines.push(`${indent}</${sanitizeTagName(node.tag)}>`);
          return lines;
        }

        function buildStaticInputsLines(staticInputs, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          const lines = [`${indent}<StaticInputs>`];
          if (staticInputs && staticInputs.length) {
            staticInputs.forEach((input) => {
              lines.push(`${indent}  <StaticInput>`);
              const attrs = { ...(input.attributes || {}) };
              delete attrs.Name;
              delete attrs.NameLatin9Key;
              const attributeOrder = getAttributeOrder("StaticInput");
              const orderedKeys = [
                ...attributeOrder,
                ...Object.keys(attrs)
                  .filter((key) => !attributeOrder.includes(key))
                  .sort(),
              ];
              orderedKeys
                .filter(
                  (key) =>
                    typeof attrs[key] !== "undefined" &&
                    attrs[key] !== null &&
                    attrs[key] !== ""
                )
                .forEach((key) => {
                  const tag = sanitizeTagName(key);
                  lines.push(`${indent}    <${tag}>${escapeXml(attrs[key])}</${tag}>`);
                });
              lines.push(`${indent}  </StaticInput>`);
            });
          } else {
            lines.push(`${indent}  <!-- No StaticInput -->`);
          }
          lines.push(`${indent}</StaticInputs>`);
          return lines;
        }

        function buildSpeedActivationLines(speedActivation, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          if (!speedActivation) {
            return [`${indent}<SpeedActivation Mode="Off" />`];
          }
          const attrs = speedActivation.attributes || {};
          const attributeOrder = getAttributeOrder("SpeedActivation");
          const orderedKeys = [
            ...attributeOrder.filter((key) => Object.prototype.hasOwnProperty.call(attrs, key)),
            ...Object.keys(attrs).filter((key) => !attributeOrder.includes(key)).sort(),
          ];
          const hasSimpleText =
            orderedKeys.length === 1 &&
            orderedKeys[0] &&
            (speedActivation.mode_key === orderedKeys[0] ||
              orderedKeys[0] === "Mode");
          if (hasSimpleText) {
            const value = attrs[orderedKeys[0]] ?? "";
            return [`${indent}<SpeedActivation>${escapeXml(value)}</SpeedActivation>`];
          }
          const lines = [`${indent}<SpeedActivation>`];
          orderedKeys
            .filter((key) => typeof attrs[key] !== "undefined" && attrs[key] !== null && attrs[key] !== "")
            .forEach((key) => {
              const tag = sanitizeTagName(key);
              lines.push(`${indent}  <${tag}>${escapeXml(attrs[key])}</${tag}>`);
            });
          lines.push(`${indent}</SpeedActivation>`);
          return lines;
        }

        function deriveCaseLayout(caseData) {
          const layout = [];
          if (Array.isArray(caseData.layout)) {
            caseData.layout.forEach((segment) => {
              if (!segment || typeof segment !== "object") {
                return;
              }
              if (segment.kind === "node" && segment.node) {
                layout.push({ kind: "node", node: cloneGenericNode(segment.node) });
              } else if (
                segment.kind === "static-inputs" ||
                segment.kind === "speed-activation"
              ) {
                if (!layout.some((entry) => entry.kind === segment.kind)) {
                  layout.push({ kind: segment.kind });
                }
              }
            });
          }
          const staticPlacement = caseData.staticInputsPlacement || "case";
          if (
            caseData.staticInputs?.length &&
            staticPlacement !== "activation" &&
            !layout.some((entry) => entry.kind === "static-inputs")
          ) {
            layout.push({ kind: "static-inputs" });
          }
          const speedPlacement = caseData.speedActivationPlacement || "case";
          if (
            caseData.speedActivation &&
            speedPlacement !== "activation" &&
            !layout.some((entry) => entry.kind === "speed-activation")
          ) {
            layout.push({ kind: "speed-activation" });
          }
          return layout;
        }

        function extractCaseNodeText(caseData, tagName) {
          if (!caseData || !Array.isArray(caseData.layout)) {
            return null;
          }
          const targetTag = (tagName || "").trim();
          for (const segment of caseData.layout) {
            if (segment?.kind !== "node" || !segment.node) {
              continue;
            }
            if (segment.node.tag === targetTag) {
              if (typeof segment.node.text === "string") {
                return segment.node.text;
              }
              return "";
            }
          }
          return null;
        }

        function buildCaseLines(caseData, caseIndex, indentLevel = 4) {
          const indent = "  ".repeat(indentLevel);
          const attrs = { ...(caseData.attributes || {}) };
          attrs.Id = String(caseIndex);
          delete attrs.DisplayOrder;
          delete attrs.Name;
          delete attrs.NameLatin9Key;
          const attrText = buildRootAttributes(attrs, getAttributeOrder("Case"));
          const lines = [`${indent}<Case${attrText ? ` ${attrText}` : ""}>`];
          const childLines = [];
          const layout = deriveCaseLayout(caseData);
          const caseNameValue =
            caseData.attributes?.Name ??
            extractCaseNodeText(caseData, "Name") ??
            buildCaseName(caseIndex);
          const displayOrderValue = String(caseIndex);
          let hasNameNode = false;
          let hasDisplayOrderNode = false;
          layout.forEach((segment) => {
            if (segment.kind === "node" && segment.node) {
              if (segment.node.tag === "Name") {
                hasNameNode = true;
                childLines.push(
                  ...buildSimpleTextNodeLines("Name", caseNameValue, indentLevel + 1)
                );
              } else if (segment.node.tag === "NameLatin9Key") {
                return;
              } else if (segment.node.tag === "DisplayOrder") {
                hasDisplayOrderNode = true;
                childLines.push(
                  ...buildSimpleTextNodeLines(
                    "DisplayOrder",
                    displayOrderValue,
                    indentLevel + 1
                  )
                );
              } else if (
                segment.node.tag === "Activation" &&
                (caseData.staticInputsPlacement === "activation" ||
                  caseData.speedActivationPlacement === "activation")
            ) {
                childLines.push(
                  ...buildActivationNodeLines(
                    segment.node,
                    caseData,
                    indentLevel + 1,
                    caseIndex
                  )
                );
              } else if (segment.node.tag === "Activation") {
                childLines.push(
                  ...buildActivationNodeLines(
                    segment.node,
                    caseData,
                    indentLevel + 1,
                    caseIndex
                  )
                );
              } else if (segment.node.tag === "StaticInputs") {
                childLines.push(
                  ...buildStaticInputsLines(caseData.staticInputs, indentLevel + 1)
                );
              } else if (segment.node.tag === "SpeedActivation") {
                childLines.push(
                  ...buildSpeedActivationLines(
                    caseData.speedActivation,
                    indentLevel + 1
                  )
                );
              } else {
                childLines.push(...buildGenericNodeLines(segment.node, indentLevel + 1));
              }
            }
          });
          const leadingNodes = [];
          if (!hasNameNode) {
            leadingNodes.push(...buildSimpleTextNodeLines("Name", caseNameValue, indentLevel + 1));
          }
          if (!hasDisplayOrderNode) {
            leadingNodes.push(
              ...buildSimpleTextNodeLines("DisplayOrder", displayOrderValue, indentLevel + 1)
            );
          }
          lines.push(...leadingNodes, ...childLines);
          lines.push(`${indent}</Case>`);
          return lines;
        }

        function buildActivationNodeLines(node, caseData, indentLevel, caseIndex = 0) {
          const indent = "  ".repeat(indentLevel);
          const attrText = buildRootAttributes(node.attributes, getAttributeOrder(node.tag));
          const lines = [`${indent}<${sanitizeTagName(node.tag)}${attrText ? ` ${attrText}` : ""}>`];
          const childNodes = Array.isArray(node.children) ? node.children : [];
          const activationHasStaticInputs = childNodes.some(
            (child) => child?.tag === "StaticInputs"
          );
          const activationHasSpeedActivation = childNodes.some(
            (child) => child?.tag === "SpeedActivation"
          );
          const inlineActivationStaticInputs =
            caseData.staticInputsPlacement === "activation" || activationHasStaticInputs;
          const inlineActivationSpeedActivation =
            caseData.speedActivationPlacement === "activation" || activationHasSpeedActivation;
          let staticInserted = false;
          let speedInserted = false;
          let minSpeedInserted = false;
          let maxSpeedInserted = false;
          let caseNumberInserted = false;
          const minSpeedValue = getCaseSpeedRangeValue(caseData, "min");
          const maxSpeedValue = getCaseSpeedRangeValue(caseData, "max");
          const numericIndex = Number.isFinite(caseIndex)
            ? caseIndex
            : Number.parseInt(caseIndex, 10);
          const caseNumberValue = String((Number.isFinite(numericIndex) ? numericIndex : 0) + 1);
          let caseNumberInsertIndex = lines.length;
          childNodes.forEach((child) => {
            if (child.tag === "StaticInputs" && inlineActivationStaticInputs) {
              lines.push(...buildStaticInputsLines(caseData.staticInputs, indentLevel + 1));
              staticInserted = true;
            } else if (
              child.tag === "SpeedActivation" &&
              inlineActivationSpeedActivation
            ) {
              lines.push(...buildSpeedActivationLines(caseData.speedActivation, indentLevel + 1));
              speedInserted = true;
            } else if (child.tag === "MinSpeed") {
              lines.push(
                ...buildSimpleTextNodeLines("MinSpeed", minSpeedValue, indentLevel + 1)
              );
              minSpeedInserted = true;
            } else if (child.tag === "MaxSpeed") {
              lines.push(
                ...buildSimpleTextNodeLines("MaxSpeed", maxSpeedValue, indentLevel + 1)
              );
              maxSpeedInserted = true;
              caseNumberInsertIndex = lines.length;
            } else if (child.tag === "CaseNumber") {
              lines.push(
                ...buildSimpleTextNodeLines("CaseNumber", caseNumberValue, indentLevel + 1)
              );
              caseNumberInserted = true;
              caseNumberInsertIndex = lines.length;
            } else {
              lines.push(...buildGenericNodeLines(child, indentLevel + 1));
            }
          });
          if (!staticInserted && inlineActivationStaticInputs) {
            lines.push(...buildStaticInputsLines(caseData.staticInputs, indentLevel + 1));
          }
          if (!speedInserted && inlineActivationSpeedActivation) {
            lines.push(...buildSpeedActivationLines(caseData.speedActivation, indentLevel + 1));
          }
          if (!minSpeedInserted) {
            lines.push(...buildSimpleTextNodeLines("MinSpeed", minSpeedValue, indentLevel + 1));
          }
          if (!maxSpeedInserted) {
            lines.push(...buildSimpleTextNodeLines("MaxSpeed", maxSpeedValue, indentLevel + 1));
            caseNumberInsertIndex = lines.length;
          }
          if (!caseNumberInserted) {
            const caseNumberLines = buildSimpleTextNodeLines(
              "CaseNumber",
              caseNumberValue,
              indentLevel + 1
            );
            lines.splice(caseNumberInsertIndex, 0, ...caseNumberLines);
          }
          lines.push(`${indent}</${sanitizeTagName(node.tag)}>`);
          return lines;
        }

        function buildSimpleTextNodeLines(tag, textValue, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          const safeTag = sanitizeTagName(tag);
          const value = textValue ?? "";
          return [`${indent}<${safeTag}>${escapeXml(value)}</${safeTag}>`];
        }

        function buildEvalCaseLines(evalCase, caseIndex, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          const attributes = { ...(evalCase?.attributes || {}) };
          attributes.Id = String(caseIndex);
          const attrText = buildRootAttributes(attributes, getAttributeOrder("Case"));
          const scanAttrs = buildRootAttributes(
            { ...(evalCase?.scanPlane?.attributes || {}), Id: evalCase?.scanPlane?.attributes?.Id || "1" },
            getAttributeOrder("ScanPlane")
          );
          const userFieldId = normalizeUserFieldIdValue(evalCase?.scanPlane?.userFieldId ?? "");
          const isSplitted = evalCase?.scanPlane?.isSplitted ?? "false";
          return [
            `${indent}<Case${attrText ? ` ${attrText}` : ""}>`,
            `${indent}  <ScanPlanes>`,
            `${indent}    <ScanPlane${scanAttrs ? ` ${scanAttrs}` : ""}>`,
            `${indent}      <UserFieldId>${escapeXml(userFieldId)}</UserFieldId>`,
            `${indent}      <IsSplitted>${escapeXml(isSplitted)}</IsSplitted>`,
            `${indent}    </ScanPlane>`,
            `${indent}  </ScanPlanes>`,
            `${indent}</Case>`,
          ];
        }

        function buildEvalResetLines(reset, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          const normalized = normalizeEvalReset(reset);
          return [
            `${indent}<Reset>`,
            `${indent}  <ResetType>${escapeXml(normalized.resetType)}</ResetType>`,
            `${indent}  <AutoResetTime>${escapeXml(normalized.autoResetTime)}</AutoResetTime>`,
            `${indent}  <EvalResetSource>${escapeXml(normalized.evalResetSource)}</EvalResetSource>`,
            `${indent}</Reset>`,
          ];
        }

        function buildPermanentPresetLines(permanentPreset, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          const normalized = normalizePermanentPreset(permanentPreset);
          const scanAttrs = buildRootAttributes(
            normalized.scanPlaneAttributes,
            getAttributeOrder("ScanPlane")
          );
          return [
            `${indent}<PermanentPreset>`,
            `${indent}  <ScanPlanes>`,
            `${indent}    <ScanPlane${scanAttrs ? ` ${scanAttrs}` : ""}>`,
            `${indent}      <FieldMode>${escapeXml(normalized.fieldMode)}</FieldMode>`,
            `${indent}    </ScanPlane>`,
            `${indent}  </ScanPlanes>`,
            `${indent}</PermanentPreset>`,
          ];
        }

        function buildEvalLines(evalEntry, evalIndex, indentLevel) {
          const indent = "  ".repeat(indentLevel);
          const attributes = { ...(evalEntry?.attributes || {}) };
          if (!attributes.Id) {
            attributes.Id = String(evalIndex + 1);
          }
          const attrText = buildRootAttributes(attributes, getAttributeOrder("Eval"));
          const name = evalEntry?.name ?? buildEvalName(evalIndex);
          const nameLatin9Key = evalEntry?.nameLatin9Key ?? "";
          const qValue = evalEntry?.q ?? String(evalIndex + 1);
          const lines = [
            `${indent}<Eval${attrText ? ` ${attrText}` : ""}>`,
            `${indent}  <Name>${escapeXml(name)}</Name>`,
            `${indent}  <NameLatin9Key>${escapeXml(nameLatin9Key)}</NameLatin9Key>`,
            `${indent}  <Q>${escapeXml(qValue)}</Q>`,
          ];
          lines.push(...buildEvalResetLines(evalEntry?.reset, indentLevel + 1));
          lines.push(`${indent}  <Cases>`);
          if (Array.isArray(evalEntry?.cases) && evalEntry.cases.length) {
            evalEntry.cases.forEach((caseEntry, caseIndex) => {
              lines.push(...buildEvalCaseLines(caseEntry, caseIndex, indentLevel + 2));
            });
          } else {
            lines.push(`${indent}    <!-- No cases defined -->`);
          }
          lines.push(`${indent}  </Cases>`);
          lines.push(...buildPermanentPresetLines(evalEntry?.permanentPreset, indentLevel + 1));
          lines.push(`${indent}</Eval>`);
          return lines;
        }

        function buildEvalsLines(evalsData, indentLevel = 3) {
          const indent = "  ".repeat(indentLevel);
          const attrText = buildRootAttributes(
            evalsData?.attributes,
            getAttributeOrder("Evals")
          );
          const lines = [`${indent}<Evals${attrText ? ` ${attrText}` : ""}>`];
          const evalEntries = evalsData?.evals || [];
          if (evalEntries.length) {
            evalEntries.forEach((entry, index) => {
              lines.push(...buildEvalLines(entry, index, indentLevel + 1));
            });
          } else {
            lines.push(`${indent}  <!-- No evals defined -->`);
          }
          lines.push(`${indent}</Evals>`);
          return lines;
        }

        function collectUserFieldDefinitions({ includeStatFields = false } = {}) {
          const entries = [];
          const shapeIdLookup = buildShapeIdLookup();
          const seenIds = new Set();
          let counter = 1;

          const reserveId = (rawId) => {
            const id = String(rawId);
            if (!id || seenIds.has(id)) {
              return null;
            }
            seenIds.add(id);
            const numericId = Number.parseInt(id, 10);
            counter = Number.isFinite(numericId)
              ? Math.max(counter, numericId + 1)
              : counter + 1;
            return id;
          };

          const allocateId = (...candidates) => {
            for (const candidate of candidates) {
              if (candidate === null || typeof candidate === "undefined") {
                continue;
              }
              const id = reserveId(candidate);
              if (id !== null) {
                return id;
              }
            }
            while (seenIds.has(String(counter))) {
              counter += 1;
            }
            const fallbackId = reserveId(counter);
            return fallbackId ?? "";
          };

          if (Array.isArray(fieldsets)) {
            fieldsets.forEach((fieldset, fieldsetIndex) => {
              const fields = Array.isArray(fieldset?.fields) ? fieldset.fields : [];
              fields.forEach((field, fieldIndex) => {
                const attributes = field?.attributes || {};
                const explicitId = attributes.UserFieldId ?? attributes.Id ?? null;
                const primaryShapeId = findPrimaryShapeIdForField(field);
                const shapeIndex = shapeIdLookup.get(String(primaryShapeId)) || null;
                const id = allocateId(explicitId, shapeIndex);
                if (!id) {
                  return;
                }
                if (attributes.UserFieldId !== id) {
                  field.attributes = { ...attributes, UserFieldId: id };
                }
                entries.push({
                  id,
                  fieldsetIndex,
                  fieldIndex,
                  field,
                  fieldset,
                  type: "fieldset",
                  shapeId: primaryShapeId,
                });
              });
            });
          }
          if (includeStatFields) {
            statFieldDefinitions.forEach((definition) => {
              entries.push({ ...definition, type: "stat" });
            });
          }
          return entries;
        }

        function formatUserFieldLabel(entry) {
          if (!entry) {
            return "";
          }
          if (entry.type === "stat") {
            return entry.label || entry.tag || entry.id;
          }
          const fieldsetName = entry.fieldset?.attributes?.Name || `Fieldset ${entry.fieldsetIndex + 1}`;
          const fieldName = entry.field?.attributes?.Name || `Field ${entry.fieldIndex + 1}`;
          return `${fieldsetName} / ${fieldName}`;
        }

        function regenerateFieldsConfiguration({ rerender = true } = {}) {
          casetableFieldsConfiguration = buildFieldsConfigurationNode();
          if (rerender) {
            renderCasetableFieldsConfiguration();
          }
        }

        function buildFieldsConfigurationNode() {
          return {
            tag: "FieldsConfiguration",
            attributes: {},
            text: "",
            children: [
              {
                tag: "ScanPlanes",
                attributes: {},
                text: "",
                children: buildFieldsConfigurationScanPlanes(),
              },
              {
                tag: "StatFields",
                attributes: {},
                text: "",
                children: buildFieldsConfigurationStatFields(),
              },
            ],
          };
        }

        function buildFieldsConfigurationScanPlanes() {
          const planes =
            Array.isArray(scanPlanes) && scanPlanes.length
              ? scanPlanes
              : [createDefaultScanPlane(0)];
          const counter = { value: 1 };
          let fieldsetsAssigned = false;
          return planes.map((plane, planeIndex) => {
            const attrs = plane?.attributes || {};
            const indexValue = attrs.Index ?? String(planeIndex);
            const numericIndex = Number.parseInt(indexValue, 10);
            const planeId = attrs.Id || (Number.isFinite(numericIndex) ? String(numericIndex + 1) : String(planeIndex + 1));
            const nameValue = attrs.Name || `ScanPlane ${planeIndex + 1}`;
            const userFieldsetsNode = fieldsetsAssigned
              ? { tag: "UserFieldsets", attributes: {}, text: "", children: [] }
              : buildFieldsConfigurationUserFieldsets(counter);
            if (!fieldsetsAssigned) {
              fieldsetsAssigned = true;
            }
            return {
              tag: "ScanPlane",
              attributes: { Id: String(planeId) },
              text: "",
              children: [
                { tag: "Index", attributes: {}, text: String(indexValue), children: [] },
                { tag: "Name", attributes: {}, text: nameValue, children: [] },
                userFieldsetsNode,
              ],
            };
          });
        }

        function buildFieldsConfigurationUserFieldsets(counter) {
          const fieldsetNodes = Array.isArray(fieldsets)
            ? fieldsets.map((fieldset, fieldsetIndex) => {
                const attrs = fieldset?.attributes || {};
                return {
                  tag: "UserFieldset",
                  attributes: { Id: String(fieldsetIndex + 1) },
                  text: "",
                  children: [
                    { tag: "Index", attributes: {}, text: String(fieldsetIndex), children: [] },
                    { tag: "Name", attributes: {}, text: attrs.Name || `Fieldset ${fieldsetIndex + 1}`, children: [] },
                    {
                      tag: "UserFields",
                      attributes: {},
                      text: "",
                      children: buildFieldsConfigurationUserFields(fieldset, fieldsetIndex, counter),
                    },
                  ],
                };
              })
            : [];
          return { tag: "UserFieldsets", attributes: {}, text: "", children: fieldsetNodes };
        }

        function buildFieldsConfigurationUserFields(fieldset, fieldsetIndex, counter) {
          const fields = Array.isArray(fieldset?.fields) ? mergeFieldsByAttributes(fieldset.fields) : [];
          return fields.map((field, fieldIndex) => {
            const attrs = field?.attributes || {};
            const primaryShapeId = findPrimaryShapeIdForField(field);
            const shapeIdLookup = buildShapeIdLookup();
            const shapeIndex = shapeIdLookup.get(String(primaryShapeId)) || null;
            const explicitId = attrs.UserFieldId ?? attrs.Id;
            const id = explicitId ?? shapeIndex ?? counter.value;
            const numericId = Number.parseInt(id, 10);
            counter.value = Number.isFinite(numericId)
              ? Math.max(counter.value, numericId + 1)
              : counter.value + 1;
            const fieldName = attrs.Name || `Field ${fieldIndex + 1}`;
            const fieldType = attrs.Fieldtype || "ProtectiveSafeBlanking";
            const multipleSampling = attrs.MultipleSampling || String(globalMultipleSampling || "2");
            const resolutionValue =
              attrs.Resolution || (typeof globalResolution !== "undefined" ? String(globalResolution) : "70");
            const contourNegative =
              attrs.ToleranceNegative ??
              attrs.ContourNegative ??
              (typeof globalToleranceNegative !== "undefined" ? String(globalToleranceNegative) : "0");
            const contourPositive =
              attrs.TolerancePositive ??
              attrs.ContourPositive ??
              (typeof globalTolerancePositive !== "undefined" ? String(globalTolerancePositive) : "0");
            return {
              tag: "UserField",
              attributes: { Id: String(id) },
              text: "",
              children: [
                { tag: "Index", attributes: {}, text: String(fieldIndex), children: [] },
                { tag: "Name", attributes: {}, text: fieldName, children: [] },
                { tag: "FieldType", attributes: {}, text: fieldType, children: [] },
                { tag: "MultipleSampling", attributes: {}, text: String(multipleSampling), children: [] },
                { tag: "ObjectResolution", attributes: {}, text: String(resolutionValue), children: [] },
                { tag: "ContourNegative", attributes: {}, text: String(contourNegative), children: [] },
                { tag: "ContourPositive", attributes: {}, text: String(contourPositive), children: [] },
              ],
            };
          });
        }

        function buildFieldsConfigurationStatFields() {
          return statFieldDefinitions.map((definition) => ({
            tag: definition.tag,
            attributes: { Id: definition.id },
            text: "",
            children: [],
          }));
        }

        function buildCasetablesXml() {
          regenerateFieldsConfiguration({ rerender: false });
          const lines = [];
          lines.push("  <Export_CasetablesAndCases>");
          const attrs = { ...(casetableAttributes || {}) };
          if (!("Index" in attrs)) {
            attrs.Index = "0";
          }
          const attrText = buildRootAttributes(attrs, getAttributeOrder("Casetable"));
          const layout =
            Array.isArray(casetableLayout) && casetableLayout.length
              ? casetableLayout
              : normalizeCasetableLayout([]);
          lines.push(`    <Casetable${attrText ? ` ${attrText}` : ""}>`);
          layout.forEach((segment) => {
            if (segment.kind === "configuration") {
              if (casetableConfiguration) {
                lines.push(...buildGenericNodeLines(casetableConfiguration, 3));
              } else {
                lines.push("      <Configuration />");
              }
            } else if (segment.kind === "cases") {
              lines.push("      <Cases>");
              if (casetableCases.length) {
                casetableCases.forEach((caseData, index) => {
                  lines.push(...buildCaseLines(caseData, index, 4));
                });
              } else {
                lines.push("        <!-- No cases defined -->");
              }
              lines.push("      </Cases>");
            } else if (segment.kind === "evals") {
              lines.push(...buildEvalsLines(casetableEvals, 3));
            } else if (segment.kind === "fields_configuration") {
              if (casetableFieldsConfiguration) {
                lines.push(...buildGenericNodeLines(casetableFieldsConfiguration, 3));
              } else {
                lines.push("      <FieldsConfiguration />");
              }
            } else if (segment.kind === "node" && segment.node) {
              lines.push(...buildGenericNodeLines(segment.node, 3));
            }
          });
          lines.push("    </Casetable>");
          lines.push("  </Export_CasetablesAndCases>");
          return lines;
        }

        function buildAttributeString(attrs, order = []) {
          if (!attrs) return "";
          const keys = Object.keys(attrs);
          const orderedKeys = [];
          const remaining = new Set(keys);
          order.forEach((key) => {
            if (remaining.has(key)) {
              orderedKeys.push(key);
              remaining.delete(key);
            }
          });
          Array.from(remaining)
            .sort()
            .forEach((key) => orderedKeys.push(key));
          return orderedKeys
            .map(
              (key) =>
                `${sanitizeTagName(key)}="${escapeXml(String(attrs[key] ?? ""))}"`
            )
            .join(" ");
        }

        function stripLatin9Key(attrs) {
          if (!attrs || typeof attrs !== "object") {
            return {};
          }
          const next = { ...attrs };
          delete next.NameLatin9Key;
          return next;
        }

        function normalizePointCoordinate(value) {
          if (typeof value === "number" && Number.isFinite(value)) {
            return String(Math.trunc(value));
          }
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) {
            return String(Math.trunc(parsed));
          }
          return typeof value === "string" ? value.trim() : String(value ?? "");
        }

        function sanitizePointAttributes(point) {
          const attrs = { ...(point || {}) };
          if (Object.prototype.hasOwnProperty.call(attrs, "X")) {
            attrs.X = normalizePointCoordinate(attrs.X);
          }
          if (Object.prototype.hasOwnProperty.call(attrs, "Y")) {
            attrs.Y = normalizePointCoordinate(attrs.Y);
          }
          return attrs;
        }

        function normalizeCircleCoordinate(value) {
          if (typeof value === "number" && Number.isFinite(value)) {
            return String(Math.round(value));
          }
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) {
            return String(Math.round(parsed));
          }
          return typeof value === "string" ? value.trim() : String(value ?? "");
        }

        function sanitizeCircleAttributes(circle) {
          const attrs = { ...(circle || {}) };
          ["CenterX", "CenterY", "Radius"].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) {
              attrs[key] = normalizeCircleCoordinate(attrs[key]);
            }
          });
          return attrs;
        }

        function getAttributeOrder(tag) {
          switch (tag) {
            case "SdImportExport":
              return ["Timestamp", "xmlns:xsd", "xmlns:xsi"];
            case "ScanPlane":
              return [
                "Index",
                "Name",
                "ScanPlaneDirection",
                "UseReferenceContour",
                "ObjectSize",
                "MultipleSampling",
                "MultipleSamplingOff2OnActivated",
                "SelectedCaseSwitching",
              ];
            case "Device":
              return [
                "Index",
                "Typekey",
                "TypekeyVersion",
                "TypekeyDisplayVersion",
                "DeviceName",
                "ResponseTime",
                "ScanResolutionAddition",
                "PositionX",
                "PositionY",
                "Rotation",
                "StandingUpsideDown",
              ];
            case "Fieldset":
              return ["Name", "NameLatin9Key"];
            case "Field":
              return [
                "Name",
                "Fieldtype",
                "MultipleSampling",
                "Resolution",
                "TolerancePositive",
                "ToleranceNegative",
              ];
            case "Casetable":
              return ["Index", "Name", "CaseTableType"];
            case "Case":
              return ["Id", "DisplayOrder", "Name"];
            case "Eval":
              return ["Id"];
            case "Evals":
              return [];
            case "StaticInput":
              return ["Name", "State", "Value", "Level", "Mode", "Match"];
            case "SpeedActivation":
              return ["Mode", "Type", "State", "Value"];
            case "Polygon":
              return ["Type"];
            case "Rectangle":
              return ["Type", "OriginX", "OriginY", "Height", "Width", "Rotation"];
            case "Circle":
              return ["Type", "CenterX", "CenterY", "Radius"];
            case "Point":
              return ["X", "Y"];
            case "GlobalGeometry":
              return ["UseGlobalGeometry"];
            default:
              return [];
          }
        }

        function buildTriOrbShapesXml() {
          if (!Array.isArray(triorbShapes) || !triorbShapes.length) {
            return ["    <!-- No TriOrb shapes -->"];
          }
          const lines = [];
          lines.push("    <Shapes>");
          triorbShapes.forEach((shape) => {
            const shapeAttrs = buildAttributeString(
              { ID: shape.id, Name: shape.name, Type: shape.type, Fieldtype: shape.fieldtype, Kind: shape.kind },
              ["ID", "Name", "Type", "Fieldtype", "Kind"]
            );
            lines.push(`      <Shape${shapeAttrs ? " " + shapeAttrs : ""}>`);
            if (shape.type === "Polygon" && shape.polygon) {
              const polygonAttr = buildAttributeString(
                { Type: getPolygonTypeValue(shape.polygon) },
                ["Type"]
              );
              lines.push(`        <Polygon${polygonAttr ? " " + polygonAttr : ""}>`);
              (shape.polygon.points || []).forEach((point) => {
                const pointAttrs = buildAttributeString(point, getAttributeOrder("Point"));
                lines.push(`          <Point${pointAttrs ? " " + pointAttrs : ""} />`);
              });
              lines.push("        </Polygon>");
            } else if (shape.type === "Rectangle" && shape.rectangle) {
              const rectAttrs = buildAttributeString(
                shape.rectangle,
                getAttributeOrder("Rectangle")
              );
              lines.push(`        <Rectangle${rectAttrs ? " " + rectAttrs : ""} />`);
            } else if (shape.type === "Circle" && shape.circle) {
              const circleAttrs = buildAttributeString(shape.circle, getAttributeOrder("Circle"));
              lines.push(`        <Circle${circleAttrs ? " " + circleAttrs : ""} />`);
            }
            lines.push("      </Shape>");
          });
          lines.push("    </Shapes>");
          return lines;
        }

        function downloadXml(xmlString, filename) {
          const blob = new Blob([xmlString], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename || `plot_${Date.now()}.sgexml`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }

        function escapeXml(value) {
          return String(value ?? "").replace(/[<>&'\"]/g, (char) => {
            switch (char) {
              case "<":
                return "&lt;";
              case ">":
                return "&gt;";
              case "&":
                return "&amp;";
              case "'":
                return "&apos;";
              case "\"":
                return "&quot;";
              default:
                return char;
            }
          });
        }

        function escapeHtml(value) {
          return String(value ?? "").replace(/[&<>"']/g, (char) => {
            switch (char) {
              case "&":
                return "&amp;";
              case "<":
                return "&lt;";
              case ">":
                return "&gt;";
              case '"':
                return "&quot;";
              case "'":
                return "&#39;";
              default:
                return char;
            }
          });
        }

        function sanitizeTagName(name) {
          return (name || "Field").replace(/[^\w:.-]/g, "_");
        }

        function buildFileInfoLines() {
          const scope = document.querySelector('[data-scope="fileinfo"]');
          if (!scope) {
            return ["    <!-- FileInfo not set -->"];
          }
          const inputs = Array.from(
            scope.querySelectorAll(
              ".menu-fileinfo-field input, .menu-fileinfo-field textarea"
            )
          );
          if (!inputs.length) {
            return ["    <!-- FileInfo not set -->"];
          }
          return inputs.map((input) => {
            const tag = sanitizeTagName(input.dataset.field || input.id || "Field");
            const rawValue = (input.value || "").trim();
            if (!rawValue) {
              return `    <${tag} />`;
            }
            const value = escapeXml(rawValue);
            return `    <${tag}>${value}</${tag}>`;
          });
        }

        function buildRootAttributes(attrs) {
          if (!attrs || typeof attrs !== "object") {
            return "";
          }
          return Object.entries(attrs)
            .map(
              ([key, value]) =>
                `${sanitizeTagName(key)}="${escapeXml(String(value ?? ""))}"`
            )
            .join(" ");
        }

        function buildRootAttributes(attrs, order = []) {
          if (!attrs || typeof attrs !== "object") {
            return "";
          }
          return buildAttributeString(attrs, order);
        }

          function invertSvgNumber(value) {
            const num = Number.parseFloat(value);
            return Number.isFinite(num) ? String(-num) : value;
          }

          function invertSvgPoints(points = []) {
            return points.map((point) => ({
              ...point,
              Y: invertSvgNumber(point.Y),
            }));
          }

          function parseSvgPoints(pointsAttr) {
            const tokens = (pointsAttr || "")
              .trim()
              .replace(/,/g, " ")
              .split(/\s+/)
              .filter(Boolean);
            const points = [];
            for (let i = 0; i + 1 < tokens.length; i += 2) {
              points.push({ X: tokens[i], Y: tokens[i + 1] });
            }
            return points;
          }

        function parseSvgPathToPolygons(d = "") {
          const trimmed = (d || "").trim();
          const pathWarnings = new Set();
          if (!trimmed) {
            return { polygons: [], warnings: [] };
          }

          const unsupportedCommands = (trimmed.match(/[AaCcQqSsTt]/g) || []).map((command) =>
            command.toUpperCase()
          );
          if (unsupportedCommands.length) {
            unsupportedCommands.forEach((command) => pathWarnings.add(`path (${command})`));
          }

          const fallback =
            unsupportedCommands.length > 0
              ? { polygons: [] }
              : parseSvgPathToPolygonsLegacy(trimmed, pathWarnings);
          if (fallback.polygons.length && pathWarnings.size === 0) {
            return { polygons: fallback.polygons, warnings: Array.from(pathWarnings) };
          }

          const sampled = sampleSvgPathToPolygon(trimmed, pathWarnings);
          return { polygons: sampled, warnings: Array.from(pathWarnings) };
        }

          function sampleSvgPathToPolygon(d, pathWarnings) {
            try {
              const path = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path"
              );
              path.setAttribute("d", d);

              const totalLength = path.getTotalLength();
              if (!Number.isFinite(totalLength) || totalLength <= 0) {
                pathWarnings.add("path (empty length)");
                return [];
              }

              const moveCommands = (d.match(/[mM]/g) || []).length;
              if (moveCommands > 1) {
                pathWarnings.add("path (multiple subpaths approximated)");
              }

              const sampleCount = Math.min(
                Math.max(Math.ceil(totalLength / 4), 200),
                2000
              );
              const points = [];
              for (let i = 0; i <= sampleCount; i += 1) {
                const distance = (totalLength * i) / sampleCount;
                const { x, y } = path.getPointAtLength(distance);
                points.push({ X: String(x), Y: String(y) });
              }

              const hasCloseCommand = /[Zz]/.test(d);
              const first = points[0];
              const last = points[points.length - 1];
              if (
                hasCloseCommand &&
                first &&
                last &&
                (first.X !== last.X || first.Y !== last.Y)
              ) {
                points.push({ ...first });
              }

              return points.length >= 3 ? [points] : [];
            } catch (error) {
              pathWarnings.add("path (sampling failed)");
              return [];
            }
          }

          function parseSvgPathToPolygonsLegacy(d = "", pathWarnings = new Set()) {
            const tokens = [];
            const regex = /([MLHVZmlhvz])|([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
            let match;
            while ((match = regex.exec(d)) !== null) {
              tokens.push(match[0]);
            }

            const isCommand = (token) => /[MLHVZmlhvz]/.test(token);
            const toNumber = (value) => {
              const parsed = Number.parseFloat(value);
              return Number.isFinite(parsed) ? parsed : null;
            };

            let index = 0;
            let command = null;
            let current = { x: 0, y: 0 };
            let subpathStart = { x: 0, y: 0 };
            let points = [];
            const polygons = [];

            const pushSubpath = () => {
              if (points.length) {
                const closedPoints = [...points];
                const first = closedPoints[0];
                const last = closedPoints[closedPoints.length - 1];
                if (first && (first.X !== last.X || first.Y !== last.Y)) {
                  closedPoints.push({ ...first });
                }
                polygons.push(closedPoints);
                points = [];
              }
            };

            while (index < tokens.length) {
              const token = tokens[index];
              if (isCommand(token)) {
                command = token;
                index += 1;
                if (command === "Z" || command === "z") {
                  pushSubpath();
                  current = { ...subpathStart };
                }
                continue;
              }
              if (!command) {
                index += 1;
                continue;
              }
              if (command === "M" || command === "m") {
                const xValue = toNumber(tokens[index]);
                const yValue = toNumber(tokens[index + 1]);
                if (xValue === null || yValue === null) {
                  break;
                }
                index += 2;
                const targetX = command === "m" ? current.x + xValue : xValue;
                const targetY = command === "m" ? current.y + yValue : yValue;
                pushSubpath();
                const point = { X: String(targetX), Y: String(targetY) };
                points.push(point);
                current = { x: targetX, y: targetY };
                subpathStart = { ...current };
                command = command === "m" ? "l" : "L";
                continue;
              }
              if (command === "L" || command === "l") {
                const xValue = toNumber(tokens[index]);
                const yValue = toNumber(tokens[index + 1]);
                if (xValue === null || yValue === null) {
                  break;
                }
                index += 2;
                const targetX = command === "l" ? current.x + xValue : xValue;
                const targetY = command === "l" ? current.y + yValue : yValue;
                const point = { X: String(targetX), Y: String(targetY) };
                points.push(point);
                current = { x: targetX, y: targetY };
                continue;
              }
              if (command === "H" || command === "h") {
                const xValue = toNumber(tokens[index]);
                if (xValue === null) {
                  break;
                }
                index += 1;
                const targetX = command === "h" ? current.x + xValue : xValue;
                const point = { X: String(targetX), Y: String(current.y) };
                points.push(point);
                current = { x: targetX, y: current.y };
                continue;
              }
              if (command === "V" || command === "v") {
                const yValue = toNumber(tokens[index]);
                if (yValue === null) {
                  break;
                }
                index += 1;
                const targetY = command === "v" ? current.y + yValue : yValue;
                const point = { X: String(current.x), Y: String(targetY) };
                points.push(point);
                current = { x: current.x, y: targetY };
                continue;
              }
              pathWarnings.add(`path (${command})`);
              index += 1;
            }

            pushSubpath();
            const validPolygons = polygons.filter((polygon) => polygon.length >= 3);
            return { polygons: validPolygons, warnings: Array.from(pathWarnings) };
          }

        function extractRotationFromTransform(transformText) {
          if (!transformText) {
            return "0";
          }
          const match = /rotate\(\s*([-+]?\d*\.?\d+)/i.exec(transformText);
          if (match && match[1]) {
            return match[1];
          }
          return "0";
        }

        function parseSvgToShapes(svgText) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(svgText, "image/svg+xml");
          if (doc.querySelector("parsererror")) {
            throw new Error("SVG の解析に失敗しました。");
          }
          const svgRoot = doc.querySelector("svg");
          if (!svgRoot) {
            throw new Error("SVG ルート要素が見つかりませんでした。");
          }
          const unsupportedTags = new Set();
          const ignoreTags = new Set(["svg", "g", "defs", "title", "desc", "metadata", "style", "clippath"]);
          const shapes = [];
          let polygonCount = 0;
          let rectangleCount = 0;
          let circleCount = 0;
          svgRoot.querySelectorAll("*").forEach((node) => {
            const tag = node.tagName.toLowerCase();
            if (ignoreTags.has(tag)) {
              return;
            }
            if (tag === "polygon") {
              const points = parseSvgPoints(node.getAttribute("points"));
              if (points.length < 3) {
                return;
              }
              polygonCount += 1;
              shapes.push({
                type: "Polygon",
                polygon: { points },
                id: node.getAttribute("id") || undefined,
                name:
                  node.getAttribute("id") ||
                  node.getAttribute("name") ||
                  node.getAttribute("inkscape:label") ||
                  `SVG Polygon ${polygonCount}`,
              });
              return;
            }
            if (tag === "rect") {
              rectangleCount += 1;
              shapes.push({
                type: "Rectangle",
                rectangle: {
                  OriginX: node.getAttribute("x") || "0",
                  OriginY: node.getAttribute("y") || "0",
                  Width: node.getAttribute("width") || "0",
                  Height: node.getAttribute("height") || "0",
                  Rotation: extractRotationFromTransform(node.getAttribute("transform")),
                },
                id: node.getAttribute("id") || undefined,
                name:
                  node.getAttribute("id") ||
                  node.getAttribute("name") ||
                  node.getAttribute("inkscape:label") ||
                  `SVG Rectangle ${rectangleCount}`,
              });
              return;
            }
            if (tag === "circle") {
              circleCount += 1;
              shapes.push({
                type: "Circle",
                circle: {
                  CenterX: node.getAttribute("cx") || "0",
                  CenterY: node.getAttribute("cy") || "0",
                  Radius: node.getAttribute("r") || "0",
                },
                id: node.getAttribute("id") || undefined,
                name:
                  node.getAttribute("id") ||
                  node.getAttribute("name") ||
                  node.getAttribute("inkscape:label") ||
                  `SVG Circle ${circleCount}`,
              });
              return;
            }
            if (tag === "path") {
              const pathData = node.getAttribute("d") || "";
              const { polygons, warnings: pathWarnings } = parseSvgPathToPolygons(pathData);
              pathWarnings.forEach((warning) => unsupportedTags.add(warning));
              if (!polygons.length) {
                return;
              }
              const primaryPolygon = polygons[0];
              if (polygons.length > 1) {
                unsupportedTags.add("path (multiple subpaths collapsed)");
              }
              const baseName =
                node.getAttribute("id") ||
                node.getAttribute("name") ||
                node.getAttribute("inkscape:label") ||
                "SVG Path";
              const rawId = node.getAttribute("id") || "";
              polygonCount += 1;
              const shapeName = baseName === "SVG Path" ? `SVG Path ${polygonCount}` : baseName;
              const shapeId = rawId || undefined;
              shapes.push({
                type: "Polygon",
                polygon: { points: primaryPolygon },
                id: shapeId,
                name: shapeName,
              });
              return;
            }
            unsupportedTags.add(node.tagName);
          });
          return { shapes, warnings: Array.from(unsupportedTags) };
        }

        function ensureUniqueShapeName(baseName, usedNames) {
          const normalized = baseName || "Shape";
          let candidate = normalized;
          let suffix = 2;
          while (usedNames.has(candidate)) {
            candidate = `${normalized} (${suffix})`;
            suffix += 1;
          }
          usedNames.add(candidate);
          return candidate;
        }

        function ensureUniqueShapeId(baseId, usedIds) {
          let candidate = baseId || createShapeId();
          while (usedIds.has(candidate)) {
            candidate = createShapeId();
          }
          usedIds.add(candidate);
          return candidate;
        }

        function findFirstByTag(root, tagName) {
          if (!root || !tagName) {
            return null;
          }
          const nsMatches = root.getElementsByTagNameNS
            ? root.getElementsByTagNameNS("*", tagName)
            : [];
          if (nsMatches && nsMatches.length) {
            return nsMatches[0];
          }
          const matches = root.getElementsByTagName(tagName);
          if (matches && matches.length) {
            return matches[0];
          }
          if (root.localName === tagName || root.tagName === tagName) {
            return root;
          }
          const anyNodes = root.querySelectorAll ? root.querySelectorAll("*") : [];
          for (const node of anyNodes) {
            if (node.localName === tagName || node.tagName === tagName) {
              return node;
            }
          }
          return null;
        }

        function findAllByTag(root, tagName) {
          if (!root || !tagName) {
            return [];
          }
          const nsMatches = root.getElementsByTagNameNS
            ? root.getElementsByTagNameNS("*", tagName)
            : [];
          if (nsMatches && nsMatches.length) {
            return Array.from(nsMatches);
          }
          const matches = root.getElementsByTagName(tagName);
          if (matches && matches.length) {
            return Array.from(matches);
          }
          const result = [];
          const anyNodes = root.querySelectorAll ? root.querySelectorAll("*") : [];
          anyNodes.forEach((node) => {
            if (node.localName === tagName || node.tagName === tagName) {
              result.push(node);
            }
          });
          if (root.localName === tagName || root.tagName === tagName) {
            result.unshift(root);
          }
          return result;
        }

        function normalizeSvgShapeEntry(entry, index) {
          const shapeType = entry.type || "Polygon";
          const shape = createDefaultTriOrbShape(triorbShapes.length + index, shapeType);
          shape.id = entry.id || shape.id || createShapeId();
          shape.name = entry.name || `SVG ${shapeType} ${index + 1}`;
          shape.fieldtype = "ProtectiveSafeBlanking";
          shape.kind = "Field";
          shape.type = shapeType;
          if (shapeType === "Polygon" && entry.polygon) {
            shape.polygon = {
              Type: "Field",
              points: invertSvgPoints(entry.polygon.points || []),
            };
          } else if (shapeType === "Rectangle" && entry.rectangle) {
            shape.rectangle = {
              ...shape.rectangle,
              ...entry.rectangle,
              OriginY: invertSvgNumber(entry.rectangle?.OriginY),
              Type: "Field",
            };
          } else if (shapeType === "Circle" && entry.circle) {
            shape.circle = {
              ...shape.circle,
              ...entry.circle,
              CenterY: invertSvgNumber(entry.circle?.CenterY),
              Type: "Field",
            };
          }
          applyShapeKind(shape, "Field");
          return shape;
        }

        function addSvgShapesToState(entries = []) {
          if (!Array.isArray(entries) || !entries.length) {
            return 0;
          }
          const usedNames = new Set(triorbShapes.map((shape) => shape.name).filter(Boolean));
          const usedIds = new Set(triorbShapes.map((shape) => shape.id).filter(Boolean));
          const normalizedShapes = entries.map((entry, index) => {
            const shape = normalizeSvgShapeEntry(entry, index);
            shape.name = ensureUniqueShapeName(shape.name, usedNames);
            shape.id = ensureUniqueShapeId(shape.id, usedIds);
            return shape;
          });
          normalizedShapes.forEach((shape) => {
            triorbShapes.push(shape);
            registerTriOrbShapeInRegistry(shape, triorbShapes.length - 1);
          });
          invalidateTriOrbShapeCaches();
          return normalizedShapes.length;
        }

        function partitionSvgShapesByName(entries = []) {
          const existingByName = new Map(
            triorbShapes.map((shape) => [shape?.name, shape]).filter(([name]) => Boolean(name))
          );
          const duplicates = [];
          const uniques = [];
          (entries || []).forEach((entry) => {
            const existing = entry?.name ? existingByName.get(entry.name) : null;
            if (existing) {
              duplicates.push({ entry, existing });
            } else {
              uniques.push(entry);
            }
          });
          return { duplicates, uniques };
        }

        function overwriteTriOrbShapeWithSvgEntry(existingShape, entry) {
          if (!existingShape || !entry) {
            return false;
          }
          const shapeIndex = triorbShapes.indexOf(existingShape);
          if (shapeIndex < 0) {
            return false;
          }
          const normalized = normalizeSvgShapeEntry(entry, shapeIndex);
          const mergedShape = {
            ...normalized,
            id: existingShape.id,
            name: existingShape.name,
            fieldtype: existingShape.fieldtype,
            kind: existingShape.kind || normalized.kind,
            visible: existingShape.visible !== false,
          };
          applyShapeKind(mergedShape, mergedShape.kind);
          triorbShapes[shapeIndex] = mergedShape;
          registerTriOrbShapeLookup(mergedShape, shapeIndex);
          return true;
        }

        function applySvgImportChanges({ additions = [], overwrites = [], warnings = [], fileName = "" } = {}) {
          let overwrittenCount = 0;
          overwrites.forEach(({ entry, existing }) => {
            if (overwriteTriOrbShapeWithSvgEntry(existing, entry)) {
              overwrittenCount += 1;
            }
          });
          const addedCount = addSvgShapesToState(additions);
          rebuildTriOrbShapeRegistry();
          renderTriOrbShapes();
          renderTriOrbShapeCheckboxes();
          renderFieldsets();
          renderFigure();
          if (warnings.length) {
            alert(`未対応の SVG 要素: ${warnings.join(", ")}`);
          }
          const warningSuffix = warnings.length ? `（未対応: ${warnings.join(", ")}）` : "";
          setStatus(
            `${fileName} から ${overwrittenCount} 件を上書きし、${addedCount} 件の Shape をインポートしました${warningSuffix}。`,
            warnings.length ? "warning" : "ok"
          );
        }

        function openSvgImportModal({ fileName, warnings = [], duplicates = [], uniques = [] } = {}) {
          if (!svgImportModal || !svgImportDuplicateList) {
            applySvgImportChanges({ additions: uniques.concat(duplicates.map((item) => item.entry)), warnings, fileName });
            return;
          }
          pendingSvgImportContext = { fileName, warnings, duplicates, additions: uniques };
          svgImportDuplicateList.innerHTML = duplicates
            .map(({ entry, existing }) => {
              const shapeName = entry?.name || existing?.name || "Shape";
              const importedType = entry?.type || "Polygon";
              const existingType = existing?.type || "Polygon";
              const safeName = escapeHtml(existing?.name || "");
              return `
                <div class="svg-import-duplicate-item" data-shape-name="${safeName}">
                  <div class="svg-import-duplicate-actions">
                    <label class="svg-import-duplicate-toggle">
                      <input type="checkbox" data-shape-name="${safeName}" data-role="import" checked />
                      <span>Import</span>
                    </label>
                    <label class="svg-import-duplicate-toggle">
                      <input type="checkbox" data-shape-name="${safeName}" data-role="overwrite" checked />
                      <span>Overwrite</span>
                    </label>
                  </div>
                  <div>
                    <div class="svg-import-duplicate-name">${escapeHtml(shapeName)}</div>
                    <div class="svg-import-duplicate-desc">既存: ${escapeHtml(existingType)} / インポート: ${escapeHtml(importedType)}</div>
                  </div>
                </div>
              `;
            })
            .join("");
          svgImportModal.classList.add("active");
          svgImportModal.setAttribute("aria-hidden", "false");
          setStatus(
            `${fileName || "SVG"} のインポート: 同名の Shape が見つかりました。インポート/上書きの対象を選択してください。`,
            "warning"
          );
        }

        function closeSvgImportModal() {
          if (svgImportModal) {
            svgImportModal.classList.remove("active");
            svgImportModal.setAttribute("aria-hidden", "true");
          }
          if (svgImportDuplicateList) {
            svgImportDuplicateList.innerHTML = "";
          }
          pendingSvgImportContext = null;
        }

        function applyPendingSvgImport() {
          if (!pendingSvgImportContext) {
            closeSvgImportModal();
            return;
          }
          const { duplicates = [], additions = [], warnings = [], fileName = "" } = pendingSvgImportContext;
          const duplicateStates = new Map(
            Array.from(svgImportDuplicateList?.querySelectorAll(".svg-import-duplicate-item") || []).map((item) => {
              const name = item.dataset.shapeName || "";
              const importInput = item.querySelector("input[data-role='import']");
              const overwriteInput = item.querySelector("input[data-role='overwrite']");
              return [
                name,
                {
                  importChecked: importInput ? importInput.checked : true,
                  overwriteChecked: overwriteInput ? overwriteInput.checked : false,
                },
              ];
            })
          );
          const overwriteTargets = [];
          const additionTargets = [...additions];
          duplicates.forEach((item) => {
            const existingName = item?.existing?.name || "";
            const state = duplicateStates.get(existingName) || { importChecked: true, overwriteChecked: true };
            if (!state.importChecked) {
              return;
            }
            if (state.overwriteChecked && existingName) {
              overwriteTargets.push(item);
              return;
            }
            additionTargets.push(item.entry);
          });
          applySvgImportChanges({ additions: additionTargets, overwrites: overwriteTargets, warnings, fileName });
          closeSvgImportModal();
        }

        function handleSvgImportResult(fileName, shapes, warnings) {
          if (!Array.isArray(shapes) || !shapes.length) {
            setStatus(
              `${fileName} に取り込める Polygon / Rectangle / Circle が見つかりませんでした。`,
              "warning"
            );
            return;
          }
          const { duplicates, uniques } = partitionSvgShapesByName(shapes);
          if (duplicates.length) {
            openSvgImportModal({ fileName, warnings, duplicates, uniques });
            return;
          }
          applySvgImportChanges({ additions: shapes, warnings, fileName });
        }

        function parseXmlToFigure(xmlText) {
          const parser = new DOMParser();
          let warningMessage = "";
          console.log("parseXmlToFigure start", {
            length: xmlText?.length,
            preview: (xmlText || "").slice(0, 120),
          });
          const triOrbTagMatches = (xmlText.match(/TriOrb_SICK_SLS_Editor/gi) || []).length;
          const firstTriOrbMatchIndex = (xmlText || "").search(/TriOrb_SICK_SLS_Editor/i);
          const triOrbContext = firstTriOrbMatchIndex >= 0
            ? (xmlText || "").slice(
                Math.max(0, firstTriOrbMatchIndex - 40),
                Math.min((xmlText || "").length, firstTriOrbMatchIndex + 80)
              )
            : "";
          const triOrbTextMatches = (xmlText.match(/triorb/gi) || []).length;
          const firstTriOrbTextIndex = (xmlText || "").search(/triorb/i);
          const triOrbTextContext = firstTriOrbTextIndex >= 0
            ? (xmlText || "").slice(
                Math.max(0, firstTriOrbTextIndex - 40),
                Math.min((xmlText || "").length, firstTriOrbTextIndex + 80)
              )
            : "";
          console.log("parseXmlToFigure TriOrb tag occurrences", {
            triOrbTagMatches,
            firstTriOrbMatchIndex,
            triOrbContext,
            triOrbTextMatches,
            firstTriOrbTextIndex,
            triOrbTextContext,
          });
          let doc = parser.parseFromString(xmlText, "application/xml");
          let sanitized = xmlText.replace(/<\?xml[^>]*\?>/gi, "").trim();
          let wrapperText = `<TriOrbWrapper>${sanitized}</TriOrbWrapper>`;
          let triOrbDoc = parser.parseFromString(wrapperText, "application/xml");
          console.log("parseXmlToFigure roots", {
            docRoot: doc?.documentElement?.tagName,
            triOrbDocRoot: triOrbDoc?.documentElement?.tagName,
          });
          if (doc.querySelector("parsererror")) {
            const wrapped = wrapperText;
            doc = parser.parseFromString(wrapped, "application/xml");
          }
          if (doc.querySelector("parsererror")) {
            throw new Error("Failed to parse XML.");
          }
          const triOrbRoot =
            findFirstByTag(triOrbDoc, "TriOrb_SICK_SLS_Editor") ||
            findFirstByTag(doc, "TriOrb_SICK_SLS_Editor");
          triOrbImportContext = { triOrbRootFound: Boolean(triOrbRoot) };
          console.log("parseXmlToFigure TriOrb root exists", Boolean(triOrbRoot));
          if (!triOrbRoot) {
            const nodesWithTriOrbInName = [];
            const nodesWithTriOrbAttrs = [];
            const collectNodeDetails = (node) => ({
              tag: node?.tagName || node?.localName,
              attrs: Array.from(node?.attributes || []).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {}),
            });
            Array.from(doc?.querySelectorAll?.("*") || []).some((node) => {
              const tag = (node.tagName || node.localName || "").toLowerCase();
              if (
                tag.includes("triorb") &&
                nodesWithTriOrbInName.length < 5
              ) {
                nodesWithTriOrbInName.push(collectNodeDetails(node));
              }
              Array.from(node?.attributes || []).some((attr) => {
                const inAttr = attr.name.toLowerCase().includes("triorb") ||
                  (attr.value || "").toLowerCase().includes("triorb");
                if (inAttr && nodesWithTriOrbAttrs.length < 5) {
                  nodesWithTriOrbAttrs.push({
                    tag: node.tagName || node.localName,
                    attr: { [attr.name]: attr.value },
                  });
                }
                return nodesWithTriOrbAttrs.length >= 5;
              });
              return (
                nodesWithTriOrbInName.length >= 5 &&
                nodesWithTriOrbAttrs.length >= 5
              );
            });
            const triOrbNodesByLocalNameFromWrapper = Array.from(
              (triOrbDoc?.querySelectorAll("*") || []).values()
            ).filter((node) => node?.localName === "TriOrb_SICK_SLS_Editor");
            const triOrbNodesByLocalNameFromDoc = Array.from(
              (doc?.querySelectorAll("*") || []).values()
            ).filter((node) => node?.localName === "TriOrb_SICK_SLS_Editor");
            const creationToolName =
              doc?.querySelector?.("CreationToolName")?.textContent || "";
            const creationToolVersion =
              doc?.querySelector?.("CreationToolVersion")?.textContent || "";
            const fileCompany = doc?.querySelector?.("Company")?.textContent || "";
            const fileCreationTime =
              doc?.querySelector?.("CreationTime")?.textContent || "";
            const exportFieldsetsPresent = Boolean(
              findFirstByTag(doc, "Export_FieldsetsAndFields")
            );
            const exportScanPlanesPresent = Boolean(
              findFirstByTag(doc, "Export_ScanPlanes")
            );
            const exportDevicesPresent = Boolean(
              findFirstByTag(doc, "Export_Devices")
            );
            const countImmediateChildren = (node) =>
              Array.from(node?.children || []).reduce((acc, child) => {
                const name = (child.tagName || child.localName || "").replace(
                  /^[^:]*:/,
                  ""
                );
                acc[name] = (acc[name] || 0) + 1;
                return acc;
              }, {});
            const topEntries = (freq) =>
              Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([name, count]) => `${name}:${count}`);
            const tagFrequency = Array.from(doc?.querySelectorAll("*") || []).reduce(
              (acc, node) => {
                const name = (node.tagName || node.localName || "").replace(/^[^:]*:/, "");
                acc[name] = (acc[name] || 0) + 1;
                return acc;
              },
              {}
            );
            const topTags = Object.entries(tagFrequency)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([name, count]) => `${name}:${count}`);
            const docRootChildFrequency = countImmediateChildren(doc?.documentElement);
            const triOrbWrapperChildFrequency = countImmediateChildren(
              triOrbDoc?.documentElement
            );
            const docRootChildTop = topEntries(docRootChildFrequency);
            const triOrbWrapperChildTop = topEntries(triOrbWrapperChildFrequency);
            const docRootChildSamples = Array.from(
              doc?.documentElement?.children || []
            )
              .slice(0, 6)
              .map((child) => ({
                tag: child.tagName || child.localName,
                attrs: Array.from(child.attributes || [])
                  .slice(0, 10)
                  .reduce((acc, attr) => {
                    acc[attr.name] = attr.value;
                    return acc;
                  }, {}),
                childTagsTop: topEntries(countImmediateChildren(child)),
              }));
            const wrapperChildren = Array.from(
              triOrbDoc?.documentElement?.children || []
            ).map((node) => node.tagName || node.localName);
            const docChildren = Array.from(doc?.documentElement?.children || []).map(
              (node) => node.tagName || node.localName
            );
            const triOrbDocError = Boolean(triOrbDoc?.querySelector?.("parsererror"));
            const docError = Boolean(doc?.querySelector?.("parsererror"));
            const triOrbFromWrapper = findFirstByTag(
              triOrbDoc?.documentElement || triOrbDoc,
              "TriOrb_SICK_SLS_Editor"
            );
            const triOrbFromDoc = findFirstByTag(
              doc?.documentElement || doc,
              "TriOrb_SICK_SLS_Editor"
            );
            const legacySafetyDesignerLikeExport =
              (doc?.documentElement?.tagName || "") === "SdImportExport" &&
              exportFieldsetsPresent &&
              exportScanPlanesPresent &&
              !triOrbTagMatches &&
              !triOrbNodesByLocalNameFromDoc.length &&
              !triOrbNodesByLocalNameFromWrapper.length;
            if (legacySafetyDesignerLikeExport) {
              warningMessage =
                "TriOrb セクションのない Safety Designer 形式を検出しました。Field 座標から形状を復元して読み込みます。";
              triOrbImportContext = {
                triOrbRootFound: false,
                legacySafetyDesignerLikeExport: true,
                creationToolName,
                creationToolVersion,
              };
              console.warn(
                "TriOrb section missing; treating as Safety Designer export with inline geometry fallback",
                {
                  creationToolName,
                  creationToolVersion,
                  exportFieldsetsPresent,
                  exportScanPlanesPresent,
                  triOrbTagMatches,
                  triOrbNodesByLocalNameFromDoc: triOrbNodesByLocalNameFromDoc.length,
                  triOrbNodesByLocalNameFromWrapper: triOrbNodesByLocalNameFromWrapper.length,
                }
              );
            }
            console.warn("TriOrb root not found", {
              docError,
              triOrbDocError,
              triOrbFromWrapper: Boolean(triOrbFromWrapper),
              triOrbFromDoc: Boolean(triOrbFromDoc),
              triOrbNodesByLocalNameFromWrapperCount: triOrbNodesByLocalNameFromWrapper.length,
              triOrbNodesByLocalNameFromDocCount: triOrbNodesByLocalNameFromDoc.length,
              triOrbNodesByLocalNameSampleFromWrapper: triOrbNodesByLocalNameFromWrapper
                .slice(0, 2)
                .map((node) => node?.outerHTML?.slice(0, 200)),
              triOrbNodesByLocalNameSampleFromDoc: triOrbNodesByLocalNameFromDoc
                .slice(0, 2)
                .map((node) => node?.outerHTML?.slice(0, 200)),
              wrapperRoot: triOrbDoc?.documentElement?.tagName,
              docRoot: doc?.documentElement?.tagName,
              wrapperChildren,
              docChildren,
              wrapperChildTagFrequencyTop12: triOrbWrapperChildTop,
              docRootChildTagFrequencyTop12: docRootChildTop,
              docRootChildSamples,
              tagFrequencyTop12: topTags,
              nodesWithTriOrbInName,
              nodesWithTriOrbAttrs,
              docRootSnippet: doc?.documentElement?.outerHTML?.slice(0, 400),
              creationToolName,
              creationToolVersion,
              fileCompany,
              fileCreationTime,
              exportFieldsetsPresent,
              exportScanPlanesPresent,
              exportDevicesPresent,
            });
          }

          triorbShapes = [];
          triorbSource = "";
          rebuildTriOrbShapeRegistry();

          populateFileInfoFromDoc(doc);
          populateScanPlanesFromDoc(doc);
          populateTriOrbShapesFromDoc(triOrbRoot);
          populateFieldsetsFromDoc(doc);
          populateCasetablesFromDoc(doc);

          const tracesFromPlotData = parsePlotDataTraces(doc);
          if (tracesFromPlotData.length) {
            const triOrbPresent = Boolean(triOrbDoc.querySelector("TriOrb_SICK_SLS_Editor"));
            return { traces: tracesFromPlotData, warning: warningMessage, triOrbPresent };
          }

          const polygonTrace = parsePolygonTrace(doc);
          if (polygonTrace.length) {
            const triOrbPresent = Boolean(triOrbDoc.querySelector("TriOrb_SICK_SLS_Editor"));
            return { traces: polygonTrace, warning: warningMessage, triOrbPresent };
          }

          const combinedWarning = [
            warningMessage,
            "Plot data was not found; displaying an empty plot.",
          ]
            .filter(Boolean)
            .join(" ");
          return {
            traces: [],
            warning: combinedWarning,
            triOrbPresent: Boolean(triOrbDoc.querySelector("TriOrb_SICK_SLS_Editor")),
          };
        }
        function buildTraceFromPoints(x, y, opts = {}, index = 0) {
          return {
            type: "scatter",
            mode: opts.mode || "lines",
            x,
            y,
            line: {
              color: opts.color || "#1f77b4",
              width: 2,
            },
            name: formatLegendLabel(opts.name || `Trace ${index + 1}`),
            hovertemplate: "<b>%{text}</b><extra></extra>",
            text: opts.name,
            meta: {
              fullLabel: opts.name || `Trace ${index + 1}`,
            },
          };
        }

        function parsePlotDataTraces(doc) {
  const traces = Array.from(
    doc.querySelectorAll(
      "PlotData > Trace, PlotlyData > Trace, PlotlyData > Traces > Trace, TriOrb_SICK_SLS_Editor > PlotlyData > Traces > Trace"
    )
  );
  return traces.map((traceNode, index) => {
            const points = Array.from(traceNode.getElementsByTagName("Point"));
            const x = [];
            const y = [];
            points.forEach((pt) => {
              const xVal = Number(pt.getAttribute("X"));
            const yVal = Number(pt.getAttribute("Y"));
            if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
              x.push(xVal);
              y.push(yVal);
            }
          });

          return buildTraceFromPoints(
            x,
            y,
            {
              name: traceNode.getAttribute("Name") || `Trace ${index + 1}`,
              mode: traceNode.getAttribute("Mode") || "lines+markers",
            },
            index
          );
        });
      }

function parsePolygonTrace(doc) {
  const polygon = doc.querySelector("Polygon");
          if (!polygon) {
            return [];
          }

          const points = Array.from(polygon.getElementsByTagName("Point"));
          const x = [];
          const y = [];
          points.forEach((pt) => {
            const xVal = Number(pt.getAttribute("X"));
            const yVal = Number(pt.getAttribute("Y"));
            if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
              x.push(xVal);
              y.push(yVal);
            }
          });

          const polygonTrace = buildTraceFromPoints(
            x,
            y,
            {
              name: polygon.getAttribute("Type") || "Polygon",
              mode: "lines+markers",
              fill: "toself",
            },
            0
          );

          const traces = [polygonTrace];
          if (originTrace) {
            traces.push(cloneTrace(originTrace));
          }
          return traces;
        }
        function populateFileInfoFromDoc(doc) {
          const fileInfoNode = doc.querySelector("FileInfo");
          if (!fileInfoNode) return;
          const inputs = document.querySelectorAll(".menu-fileinfo-field input");
          inputs.forEach((input) => {
            const targetTag = input.dataset.field || sanitizeTagName(input.id || "Field");
            const element = fileInfoNode.getElementsByTagName(targetTag)[0];
            if (element && typeof element.textContent === "string") {
              input.value = element.textContent.trim();
            }
          });
        }

        function populateScanPlanesFromDoc(doc) {
          const planeNodes = doc.querySelectorAll("Export_ScanPlanes > ScanPlane");
          if (!planeNodes.length) {
            return;
          }
          scanPlanes = Array.from(planeNodes).map((planeNode, planeIndex) => {
            const attributes = {};
            Array.from(planeNode.attributes).forEach((attr) => {
              attributes[attr.name] = attr.value;
            });
            if (!("Index" in attributes)) {
              attributes.Index = String(planeIndex);
            }
            const devices = Array.from(planeNode.querySelectorAll("Devices > Device")).map((deviceNode, deviceIndex) => {
              const deviceAttrs = {};
              Array.from(deviceNode.attributes).forEach((attr) => {
                deviceAttrs[attr.name] = attr.value;
              });
              if (!("Index" in deviceAttrs)) {
                deviceAttrs.Index = String(deviceIndex);
              }
              return { attributes: deviceAttrs };
            });
            return { attributes, devices };
          });
          renderScanPlanes();
        }

        function collectTriOrbShapeDetails(shapeNode) {
          const type = shapeNode.getAttribute("Type") || "Polygon";
          const result = { id: shapeNode.getAttribute("ID") || createShapeId(), name: shapeNode.getAttribute("Name") || "", type };
          if (type === "Polygon") {
            const polygon = findFirstByTag(shapeNode, "Polygon");
            if (polygon) {
              result.polygon = {
                Type: polygon.getAttribute("Type") || "CutOut",
                points: Array.from(polygon.getElementsByTagName("Point")).map((pt) => ({
                  X: pt.getAttribute("X") || "0",
                  Y: pt.getAttribute("Y") || "0",
                })),
              };
            }
          } else if (type === "Rectangle") {
            const rectangle = findFirstByTag(shapeNode, "Rectangle");
            if (rectangle) {
              result.rectangle = Array.from(rectangle.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {});
            }
          } else if (type === "Circle") {
            const circle = findFirstByTag(shapeNode, "Circle");
            if (circle) {
              result.circle = Array.from(circle.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {});
            }
          }
          return result;
        }

        function populateTriOrbShapesFromDoc(triOrbNode) {
          const describeNode = (node) => {
            if (!node) return null;
            return {
              tag: node.tagName || node.localName,
              attrs: Array.from(node.attributes || []).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {}),
              childTags: Array.from(node.children || []).map(
                (child) => child.tagName || child.localName
              ),
            };
          };
          console.log("populateTriOrbShapesFromDoc triOrbNode", describeNode(triOrbNode));
          if (!triOrbNode) {
            triorbSource = "";
            triorbShapes = [];
            rebuildTriOrbShapeRegistry();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            return;
          }
          triorbSource = triOrbNode.getAttribute("Source") || triorbSource || "";
          const shapesParent = findFirstByTag(triOrbNode, "Shapes");
          console.log("populateTriOrbShapesFromDoc shapesParent", describeNode(shapesParent));
          if (!shapesParent) {
            triorbShapes = [];
            rebuildTriOrbShapeRegistry();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            return;
          }
          const nodes = findAllByTag(shapesParent, "Shape");
          console.log(
            "populateTriOrbShapesFromDoc TriOrb node",
            shapesParent.parentElement?.tagName,
            "shapes count",
            nodes.length
          );
          nodes.slice(0, 3).forEach((node, idx) => {
            console.log("shape node sample", idx, describeNode(node));
          });
          if (!nodes.length) {
            triorbShapes = [];
            rebuildTriOrbShapeRegistry();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            return;
          }
          triorbShapes = nodes.map((shapeNode, index) => {
            const detail = collectTriOrbShapeDetails(shapeNode);
            const shapeEntry = {
              id: detail.id,
              name: detail.name || `Shape ${index + 1}`,
              type: detail.type || "Polygon",
              fieldtype: shapeNode.getAttribute("Fieldtype") || "ProtectiveSafeBlanking",
              kind: shapeNode.getAttribute("Kind") || undefined,
              polygon: detail.polygon || createDefaultPolygonDetails(),
              rectangle: detail.rectangle || createDefaultRectangleDetails(),
              circle: detail.circle || createDefaultCircleDetails(),
              visible: true,
            };
            applyShapeKind(
              shapeEntry,
              shapeEntry.kind ||
                getPolygonTypeValue(shapeEntry.polygon) ||
                shapeEntry.rectangle?.Type ||
                shapeEntry.circle?.Type ||
                "Field"
            );
            return shapeEntry;
          });
          rebuildTriOrbShapeRegistry();
          renderTriOrbShapes();
          renderTriOrbShapeCheckboxes();
        }

        function elementAttributesToObject(element) {
          if (!element) {
            return {};
          }
          return Array.from(element.attributes || []).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {});
        }

        function collectPolygonPointsFromNode(polygonNode) {
          if (!polygonNode) {
            return [];
          }
          return Array.from(polygonNode.querySelectorAll("Point")).map((pointNode) => ({
            X: pointNode.getAttribute("X") || "0",
            Y: pointNode.getAttribute("Y") || "0",
          }));
        }

        function collectShapeRefsFromFieldNode(fieldNode, inlineGeometry, context, diag) {
          const refs = [];
          if (fieldNode) {
            const shapeNodes = Array.from(fieldNode.querySelectorAll(":scope > Shapes > Shape"));
            if (diag) {
              diag.shapeNodes += shapeNodes.length;
            }
            shapeNodes.forEach((shapeNode) => {
              const referencedId = shapeNode.getAttribute("ID") || shapeNode.getAttribute("ShapeId");
              if (referencedId) {
                refs.push({ shapeId: referencedId });
                if (diag) {
                  diag.shapeRefsFromId += 1;
                }
                return;
              }
              const nodeType =
                shapeNode.getAttribute("Type") ||
                shapeNode.getAttribute("Kind") ||
                "Polygon";
              if (nodeType === "Rectangle") {
                const rectangleNode = shapeNode.querySelector("Rectangle");
                const rectAttrs = elementAttributesToObject(rectangleNode || shapeNode);
                const shapeId = ensureTriOrbShapeFromGeometry("Rectangle", rectAttrs, null, context);
                refs.push({ shapeId });
                if (diag) {
                  diag.shapeRefsFromShapes += 1;
                }
              } else if (nodeType === "Circle") {
                const circleNode = shapeNode.querySelector("Circle");
                const circleAttrs = elementAttributesToObject(circleNode || shapeNode);
                const shapeId = ensureTriOrbShapeFromGeometry("Circle", circleAttrs, null, context);
                refs.push({ shapeId });
                if (diag) {
                  diag.shapeRefsFromShapes += 1;
                }
              } else {
                const polygonNode = shapeNode.querySelector("Polygon") || shapeNode;
                const polygonAttrs = elementAttributesToObject(polygonNode);
                const points = collectPolygonPointsFromNode(polygonNode);
                const shapeId = ensureTriOrbShapeFromGeometry("Polygon", polygonAttrs, points, context);
                refs.push({ shapeId });
                if (diag) {
                  diag.shapeRefsFromShapes += 1;
                }
              }
            });
          }
          if (refs.length) {
            return refs;
          }
          const fallbackRefs = [];
          (inlineGeometry.polygons || []).forEach((polygon) => {
            const polygonAttrs = { ...(polygon.attributes || {}) };
            if (!polygonAttrs.Type && polygon.Type) {
              polygonAttrs.Type = polygon.Type;
            }
            const points = (polygon.points || []).map((point) => ({
              X: String(point.X ?? "0"),
              Y: String(point.Y ?? "0"),
            }));
            const shapeId = ensureTriOrbShapeFromGeometry("Polygon", polygonAttrs, points, context);
            fallbackRefs.push({ shapeId });
            if (diag) {
              diag.shapeRefsFromInline += 1;
            }
          });
          (inlineGeometry.rectangles || []).forEach((rectangle) => {
            const shapeId = ensureTriOrbShapeFromGeometry("Rectangle", rectangle, null, context);
            fallbackRefs.push({ shapeId });
            if (diag) {
              diag.shapeRefsFromInline += 1;
            }
          });
          (inlineGeometry.circles || []).forEach((circle) => {
            const shapeId = ensureTriOrbShapeFromGeometry("Circle", circle, null, context);
            fallbackRefs.push({ shapeId });
            if (diag) {
              diag.shapeRefsFromInline += 1;
            }
          });
          return fallbackRefs;
        }

        function populateFieldsetsFromDoc(doc) {
          const scanPlaneNode = doc.querySelector(
            "Export_FieldsetsAndFields > ScanPlane"
          );
          if (!scanPlaneNode) {
            fieldsets = [createDefaultFieldset(0)];
            fieldsetDevices = [createDefaultFieldsetDevice(0)];
            fieldsetGlobalGeometry = initializeGlobalGeometry({});
            renderFieldsets();
            renderFieldsetDevices();
            renderFieldsetGlobal();
            return;
          }

          const devicesParent = scanPlaneNode.querySelector("Devices");
          if (devicesParent) {
            fieldsetDevices = Array.from(
              devicesParent.querySelectorAll("Device")
            ).map((deviceNode, deviceIndex) => {
              const attrs = {};
              Array.from(deviceNode.attributes).forEach((attr) => {
                attrs[attr.name] = attr.value;
              });
              const scanDevice = findScanPlaneDeviceByTypekey(attrs.Typekey);
              if (scanDevice?.attributes?.DeviceName) {
                attrs.DeviceName = scanDevice.attributes.DeviceName;
              } else if (!("DeviceName" in attrs)) {
                attrs.DeviceName = `Device ${deviceIndex + 1}`;
              }
              return { attributes: attrs };
            });
          } else {
            fieldsetDevices = [];
          }

          const globalNode = scanPlaneNode.querySelector("GlobalGeometry");
          fieldsetGlobalGeometry = globalNode
            ? Array.from(globalNode.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {})
            : { UseGlobalGeometry: "false" };

          const fieldsetsParent = scanPlaneNode.querySelector("Fieldsets");
          const fieldsetNodes = fieldsetsParent
            ? fieldsetsParent.querySelectorAll("Fieldset")
            : [];

          if (!fieldsetNodes.length) {
            fieldsets = [createDefaultFieldset(0)];
          } else {
            const fieldImportDiag = {
              fieldsetCount: fieldsetNodes.length,
              fieldCount: 0,
              shapeNodes: 0,
              shapeRefsFromId: 0,
              shapeRefsFromShapes: 0,
              shapeRefsFromInline: 0,
              inlineGeometryFields: 0,
            };
            fieldsets = Array.from(fieldsetNodes).map((fieldsetNode, fieldsetIndex) => {
              const attributes = {};
              Array.from(fieldsetNode.attributes).forEach((attr) => {
                attributes[attr.name] = attr.value;
              });
              if (!("Name" in attributes)) {
                attributes.Name = `Fieldset ${fieldsetIndex + 1}`;
              }

              const fieldNodes = Array.from(
                fieldsetNode.querySelectorAll("Field")
              );

              const fields = fieldNodes.map((fieldNode, fieldIndex) => {
                fieldImportDiag.fieldCount += 1;
                const fieldAttrs = {};
                Array.from(fieldNode.attributes).forEach((attr) => {
                  fieldAttrs[attr.name] = attr.value;
                });
                if (!("Name" in fieldAttrs)) {
                  fieldAttrs.Name = `Field ${fieldIndex + 1}`;
                }

                const polygonNodes = Array.from(
                  fieldNode.querySelectorAll("Polygon")
                );
                const polygons = polygonNodes.map((polygonNode) => {
                  const polygonAttrs = {};
                  Array.from(polygonNode.attributes).forEach((attr) => {
                    polygonAttrs[attr.name] = attr.value;
                  });
                  const pointNodes = Array.from(polygonNode.querySelectorAll("Point"));
                  const points = pointNodes.map((pointNode) => {
                    const pointAttrs = {};
                    Array.from(pointNode.attributes).forEach((attr) => {
                      pointAttrs[attr.name] = attr.value;
                    });
                    return pointAttrs;
                  });
                  return { attributes: polygonAttrs, points };
                });

                const circleNodes = Array.from(
                  fieldNode.querySelectorAll("Circle")
                );
                const circles = circleNodes.map((circleNode) => {
                  const circleAttrs = {};
                  Array.from(circleNode.attributes).forEach((attr) => {
                    circleAttrs[attr.name] = attr.value;
                  });
                  return circleAttrs;
                });

                const rectangleNodes = Array.from(
                  fieldNode.querySelectorAll("Rectangle")
                );
                const rectangles = rectangleNodes.map((rectangleNode) => {
                  const rectangleAttrs = {};
                  Array.from(rectangleNode.attributes).forEach((attr) => {
                    rectangleAttrs[attr.name] = attr.value;
                  });
                  return rectangleAttrs;
                });

                const shapeContext = {
                  fieldsetName: attributes.Name,
                  fieldName: fieldAttrs.Name,
                  fieldtype: fieldAttrs.Fieldtype,
                };
                const shapeRefs = collectShapeRefsFromFieldNode(
                  fieldNode,
                  { polygons, rectangles, circles },
                  shapeContext,
                  fieldImportDiag
                );
                if (
                  fieldImportDiag &&
                  ((polygons && polygons.length) || rectangles.length || circles.length)
                ) {
                  fieldImportDiag.inlineGeometryFields += 1;
                }

                return {
                  attributes: fieldAttrs,
                  polygons,
                  circles,
                  rectangles,
                  shapeRefs,
                };
              });

              return {
                attributes,
                fields,
                visible: true,
              };
            });
            console.log("populateFieldsetsFromDoc import summary", {
              ...fieldImportDiag,
              triOrbRootFound: triOrbImportContext.triOrbRootFound,
            });
          }

          globalMultipleSampling = deriveInitialMultipleSampling(fieldsets);
          if (globalMultipleSamplingInput) {
            globalMultipleSamplingInput.value = globalMultipleSampling;
          }
          applyGlobalMultipleSampling(globalMultipleSampling, { rerender: false });
          renderFieldsets();
          renderFieldsetDevices();
          renderFieldsetGlobal();
          renderTriOrbShapes();
          renderTriOrbShapeCheckboxes();
        }

        function convertElementToGenericNode(element) {
          if (!element || !element.tagName) {
            return null;
          }
          const attrs = {};
          Array.from(element.attributes || []).forEach((attr) => {
            attrs[attr.name] = attr.value;
          });
          const textContent = Array.from(element.childNodes || [])
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((text) => text.textContent || "")
            .join("")
            .trim();
          const children = Array.from(element.children || [])
            .map((child) => convertElementToGenericNode(child))
            .filter(Boolean);
          return { tag: element.tagName, attributes: attrs, text: textContent, children };
        }

        function serializeStaticInputElement(element) {
          const attrs = {};
          Array.from(element.attributes || []).forEach((attr) => {
            attrs[attr.name] = attr.value;
          });
          Array.from(element.children || []).forEach((child) => {
            const tagName = child.tagName;
            const textValue = child.textContent?.trim();
            if (!tagName || !textValue) {
              return;
            }
            if (tagName === "Match") {
              attrs.Match = textValue;
            } else if (tagName === "Name" && !attrs.Name) {
              attrs.Name = textValue;
            }
          });
          const valueKey = resolveStaticInputValueKey(attrs);
          return { attributes: attrs, value_key: valueKey };
        }

        function serializeSpeedActivationElement(element) {
          const attrs = {};
          Array.from(element.attributes || []).forEach((attr) => {
            attrs[attr.name] = attr.value;
          });
          if (!Object.keys(attrs).length) {
            const textValue = element.textContent?.trim();
            if (textValue) {
              attrs.Mode = textValue;
            }
          }
          return { attributes: attrs, mode_key: resolveSpeedActivationKey(attrs) };
        }

        function serializeCaseElement(caseElement) {
          const attrs = {};
          Array.from(caseElement.attributes || []).forEach((attr) => {
            attrs[attr.name] = attr.value;
          });
          delete attrs.NameLatin9Key;
          const entry = {
            attributes: attrs,
            static_inputs: [],
            static_inputs_placement: null,
            speed_activation: null,
            speed_activation_placement: null,
            layout: [],
          };
          Array.from(caseElement.children || []).forEach((child) => {
            if (child.tagName === "StaticInputs") {
              const staticInputs = Array.from(child.querySelectorAll(":scope > StaticInput")).map((staticNode) =>
                serializeStaticInputElement(staticNode)
              );
              entry.static_inputs = staticInputs;
              entry.static_inputs_placement = "case";
              entry.layout.push({ kind: "static-inputs" });
            } else if (child.tagName === "SpeedActivation") {
              entry.speed_activation = serializeSpeedActivationElement(child);
              entry.speed_activation_placement = "case";
              entry.layout.push({ kind: "speed-activation" });
            } else {
              if (child.tagName === "Name") {
                entry.attributes.Name = child.textContent?.trim() || entry.attributes.Name;
              } else if (child.tagName === "DisplayOrder") {
                entry.attributes.DisplayOrder = child.textContent?.trim() || entry.attributes.DisplayOrder;
              } else if (child.tagName === "NameLatin9Key") {
                return;
              }
              if (!entry.static_inputs_placement && child.tagName === "Activation") {
                const activationStaticInputs = child.querySelector(":scope > StaticInputs");
                if (activationStaticInputs) {
                  entry.static_inputs = Array.from(
                    activationStaticInputs.querySelectorAll(":scope > StaticInput")
                  ).map((staticNode) => serializeStaticInputElement(staticNode));
                  entry.static_inputs_placement = "activation";
                }
              }
              if (!entry.speed_activation_placement && child.tagName === "Activation") {
                const activationSpeed = child.querySelector(":scope > SpeedActivation");
                if (activationSpeed) {
                  entry.speed_activation = serializeSpeedActivationElement(activationSpeed);
                  entry.speed_activation_placement = "activation";
                }
              }
              if (child.tagName === "Activation") {
                if (typeof entry.activationMinSpeed === "undefined") {
                  const minSpeedNode = child.querySelector(":scope > MinSpeed");
                  if (minSpeedNode && typeof minSpeedNode.textContent === "string") {
                    entry.activationMinSpeed = minSpeedNode.textContent.trim();
                  }
                }
                if (typeof entry.activationMaxSpeed === "undefined") {
                  const maxSpeedNode = child.querySelector(":scope > MaxSpeed");
                  if (maxSpeedNode && typeof maxSpeedNode.textContent === "string") {
                    entry.activationMaxSpeed = maxSpeedNode.textContent.trim();
                  }
                }
              }
              entry.layout.push({ kind: "node", node: convertElementToGenericNode(child) });
            }
          });
          if (!entry.static_inputs_placement) {
            entry.static_inputs_placement = "case";
          }
          if (!entry.speed_activation_placement) {
            entry.speed_activation_placement = "case";
          }
          return entry;
        }

        function serializeEvalCaseElement(caseElement) {
          const attributes = {};
          Array.from(caseElement.attributes || []).forEach((attr) => {
            attributes[attr.name] = attr.value;
          });
          const scanPlaneNode = caseElement.querySelector("ScanPlanes > ScanPlane");
          const scanPlaneAttributes = {};
          let userFieldId = "";
          let isSplitted = "";
          if (scanPlaneNode) {
            Array.from(scanPlaneNode.attributes || []).forEach((attr) => {
              scanPlaneAttributes[attr.name] = attr.value;
            });
            const userFieldNode = scanPlaneNode.querySelector("UserFieldId");
            const splitNode = scanPlaneNode.querySelector("IsSplitted");
            if (userFieldNode && typeof userFieldNode.textContent === "string") {
              userFieldId = userFieldNode.textContent.trim();
            }
            if (splitNode && typeof splitNode.textContent === "string") {
              isSplitted = splitNode.textContent.trim();
            }
          }
          return {
            attributes,
            scanPlane: { attributes: scanPlaneAttributes, userFieldId, isSplitted },
          };
        }

        function serializeEvalElement(evalElement) {
          const attributes = {};
          Array.from(evalElement.attributes || []).forEach((attr) => {
            attributes[attr.name] = attr.value;
          });
          const name = evalElement.querySelector(":scope > Name");
          const latinKey = evalElement.querySelector(":scope > NameLatin9Key");
          const qNode = evalElement.querySelector(":scope > Q");
          const resetNode = evalElement.querySelector(":scope > Reset");
          const permanentNode = evalElement.querySelector(
            ":scope > PermanentPreset > ScanPlanes > ScanPlane"
          );
          const casesParent = evalElement.querySelector(":scope > Cases");
          const reset = {
            resetType: resetNode?.querySelector("ResetType")?.textContent?.trim() || "",
            autoResetTime: resetNode?.querySelector("AutoResetTime")?.textContent?.trim() || "",
            evalResetSource:
              resetNode?.querySelector("EvalResetSource")?.textContent?.trim() || "",
          };
          const permanentPreset = {
            scanPlaneAttributes: {},
            fieldMode: permanentNode?.querySelector("FieldMode")?.textContent?.trim() || "",
          };
          if (permanentNode) {
            Array.from(permanentNode.attributes || []).forEach((attr) => {
              permanentPreset.scanPlaneAttributes[attr.name] = attr.value;
            });
          }
          const cases = casesParent
            ? Array.from(casesParent.querySelectorAll(":scope > Case")).map((caseElement) =>
                serializeEvalCaseElement(caseElement)
              )
            : [];
          return {
            attributes,
            name: name?.textContent?.trim() || "",
            nameLatin9Key: latinKey?.textContent?.trim() || "",
            q: qNode?.textContent?.trim() || "",
            reset,
            cases,
            permanentPreset,
          };
        }

        function serializeEvalsElement(evalsElement) {
          const attributes = {};
          Array.from(evalsElement.attributes || []).forEach((attr) => {
            attributes[attr.name] = attr.value;
          });
          const evals = Array.from(evalsElement.querySelectorAll(":scope > Eval")).map((evalElement) =>
            serializeEvalElement(evalElement)
          );
          return { attributes, evals };
        }

        function applyFieldsConfigurationUserFieldIds(fieldsConfigurationElement) {
          if (!fieldsConfigurationElement || !Array.isArray(fieldsets)) {
            return;
          }
          const scanPlaneNodes = Array.from(
            fieldsConfigurationElement.querySelectorAll(":scope > ScanPlanes > ScanPlane")
          );
          scanPlaneNodes.forEach((scanPlaneNode) => {
            const userFieldsetNodes = Array.from(
              scanPlaneNode.querySelectorAll(":scope > UserFieldsets > UserFieldset")
            );
            userFieldsetNodes.forEach((fieldsetNode) => {
              const fieldsetIndexNode = fieldsetNode.querySelector(":scope > Index");
              const fieldsetIndex = Number.parseInt(fieldsetIndexNode?.textContent ?? "", 10);
              if (
                !Number.isInteger(fieldsetIndex) ||
                fieldsetIndex < 0 ||
                fieldsetIndex >= fieldsets.length
              ) {
                return;
              }
              const targetFieldset = fieldsets[fieldsetIndex];
              const userFieldNodes = Array.from(
                fieldsetNode.querySelectorAll(":scope > UserFields > UserField")
              );
              userFieldNodes.forEach((userFieldNode) => {
                const idAttr = userFieldNode.getAttribute("Id");
                if (!idAttr) {
                  return;
                }
                const fieldIndexNode = userFieldNode.querySelector(":scope > Index");
                const fieldIndex = Number.parseInt(fieldIndexNode?.textContent ?? "", 10);
                if (
                  !Number.isInteger(fieldIndex) ||
                  fieldIndex < 0 ||
                  fieldIndex >= targetFieldset.fields.length
                ) {
                  return;
                }
                const targetField = targetFieldset.fields[fieldIndex];
                targetField.attributes = targetField.attributes || {};
                targetField.attributes.UserFieldId = idAttr;
              });
            });
          });
        }

        function populateCasetablesFromDoc(doc) {
          const casetableNodes = Array.from(
            doc.querySelectorAll("Export_CasetablesAndCases > Casetable")
          );
          let casetableNode =
            casetableNodes.find((node) => node.getAttribute("Index") === "0") ||
            casetableNodes[0] ||
            null;
          if (!casetableNode) {
            casetableAttributes = { Index: "0" };
            casetableConfiguration = createDefaultCasetableConfiguration();
            casetableCases = [createDefaultCasetableCase(0)];
            caseToggleStates = casetableCases.map(() => false);
            casetableLayout = normalizeCasetableLayout([]);
            casetableEvals = normalizeCasetableEvals(null, casetableCases.length);
            casetableFieldsConfiguration = null;
            renderCasetableConfiguration();
            renderCasetableCases();
            renderCasetableFieldsConfiguration();
            return;
          }
          const fieldsConfigurationElement = casetableNode.querySelector(
            ":scope > FieldsConfiguration"
          );
          applyFieldsConfigurationUserFieldIds(fieldsConfigurationElement);
          casetableAttributes = Array.from(casetableNode.attributes || []).reduce(
            (acc, attr) => {
              acc[attr.name] = attr.value;
              return acc;
            },
            {}
          );
          const layout = [];
          Array.from(casetableNode.children || []).forEach((child) => {
            if (child.tagName === "Configuration") {
              casetableConfiguration =
                convertElementToGenericNode(child) || createDefaultCasetableConfiguration();
              layout.push({ kind: "configuration" });
            } else if (child.tagName === "Cases") {
              const serializedCases = Array.from(child.querySelectorAll(":scope > Case")).map((caseElement) =>
                serializeCaseElement(caseElement)
              );
              casetableCases = initializeCasetableCases(serializedCases);
              caseToggleStates = casetableCases.map(() => false);
              layout.push({ kind: "cases" });
            } else if (child.tagName === "Evals") {
              casetableEvals = normalizeCasetableEvals(
                serializeEvalsElement(child),
                casetableCases.length
              );
              layout.push({ kind: "evals" });
            } else if (child.tagName === "FieldsConfiguration") {
              layout.push({ kind: "fields_configuration" });
            } else {
              layout.push({ kind: "node", node: convertElementToGenericNode(child) });
            }
          });
          casetableLayout = normalizeCasetableLayout(layout);
          if (!layout.some((segment) => segment.kind === "cases")) {
            casetableCases = initializeCasetableCases([]);
            caseToggleStates = casetableCases.map(() => false);
          }
          if (!layout.some((segment) => segment.kind === "evals")) {
            casetableEvals = normalizeCasetableEvals(null, casetableCases.length);
          }
          renderCasetableConfiguration();
          renderCasetableCases();
          renderCasetableFieldsConfiguration();
        }

        function findOriginTrace(figure) {
          return figure.data?.find((trace) => {
            const x = trace.x || [];
            const y = trace.y || [];
            return x.length === 1 && y.length === 1 && x[0] === 0 && y[0] === 0;
          });
        }

        function syncPlotSize() {
          if (!plotWrapper) return;
          const width = plotWrapper.clientWidth;
          const computedHeight = Math.max(420, Math.min(900, width * 0.6));
          plotNode.style.height = `${computedHeight}px`;
        }

        if (addScanPlaneBtn) {
          addScanPlaneBtn.addEventListener("click", () => {
            scanPlanes.push(createDefaultScanPlane(scanPlanes.length));
            renderScanPlanes();
          });
        }

        if (scanPlanesContainer) {
          scanPlanesContainer.addEventListener("click", (event) => {
            const addTarget = event.target.closest("[data-action='add-device']");
            if (addTarget) {
              event.preventDefault();
              event.stopPropagation();
              const planeIndex = Number(addTarget.dataset.planeIndex);
              const plane = scanPlanes[planeIndex];
              if (plane) {
                const newDevice = createDefaultDevice(plane.devices.length);
                plane.devices.push(newDevice);
                renderScanPlanes();
              }
              return;
            }

            const removeDeviceTarget = event.target.closest("[data-action='remove-device']");
            if (removeDeviceTarget) {
              if (removeDeviceTarget.disabled) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const planeIndex = Number(removeDeviceTarget.dataset.planeIndex);
              const deviceIndex = Number(removeDeviceTarget.dataset.deviceIndex);
              const plane = scanPlanes[planeIndex];
              if (!plane || !Array.isArray(plane.devices) || plane.devices.length <= 1) {
                setStatus("Each ScanPlane requires at least one Device.", "warning");
                return;
              }
              if (plane.devices) {
                plane.devices.splice(deviceIndex, 1);
                renderScanPlanes();
              }
              return;
            }

            const removePlaneTarget = event.target.closest("[data-action='remove-scanplane']");
            if (removePlaneTarget) {
              if (removePlaneTarget.disabled) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              if (scanPlanes.length <= 1) {
                setStatus("At least one ScanPlane must remain.", "warning");
                return;
              }
              const planeIndex = Number(removePlaneTarget.dataset.planeIndex);
              scanPlanes.splice(planeIndex, 1);
              renderScanPlanes();
            }
          });

          scanPlanesContainer.addEventListener("input", (event) => {
            const target = event.target;
            if (target.classList.contains("scanplane-attr")) {
              const planeIndex = Number(target.dataset.planeIndex);
              const field = target.dataset.field;
              updateScanPlaneAttribute(
                planeIndex,
                field,
                resolveStructuredInputValue(target)
              );
            } else if (target.classList.contains("device-attr")) {
              const planeIndex = Number(target.dataset.planeIndex);
              const deviceIndex = Number(target.dataset.deviceIndex);
              const field = target.dataset.field;
              updateDeviceAttribute(
                planeIndex,
                deviceIndex,
                field,
                resolveStructuredInputValue(target)
              );
            }
          });
        }

        if (addFieldsetBtn) {
          addFieldsetBtn.addEventListener("click", () => {
            fieldsets.push(createDefaultFieldset(fieldsets.length));
            applyGlobalMultipleSampling(globalMultipleSampling, { rerender: false });
            renderFieldsets();
          });
        }

        if (globalMultipleSamplingInput) {
          globalMultipleSamplingInput.addEventListener("input", (event) => {
            let value = parseInt(event.target.value, 10);
            if (Number.isNaN(value)) {
              value = 2;
            }
            value = Math.min(16, Math.max(2, value));
            event.target.value = value;
            applyGlobalMultipleSampling(String(value));
            handleTriOrbFieldChange();
          });
        }

        function updateGlobalFieldAttributes() {
          fieldsets.forEach((fieldset) => {
            (fieldset.fields || []).forEach((field) => {
              field.attributes = field.attributes || {};
              field.attributes.MultipleSampling = String(globalMultipleSampling);
              field.attributes.Resolution = String(globalResolution);
              field.attributes.TolerancePositive = String(globalTolerancePositive);
              field.attributes.ToleranceNegative = String(globalToleranceNegative);
            });
          });
        }

        function handleTriOrbFieldChange() {
          updateGlobalFieldAttributes();
          renderFieldsets();
          renderFigure();
        }

        if (globalResolutionInput) {
          globalResolutionInput.addEventListener("input", (event) => {
            const value = parseNumeric(event.target.value, globalResolution);
            globalResolution = Number.isFinite(value) ? value : globalResolution;
            event.target.value = globalResolution;
            handleTriOrbFieldChange();
          });
        }

        if (globalTolerancePositiveInput) {
          globalTolerancePositiveInput.addEventListener("input", (event) => {
            const value = parseNumeric(event.target.value, globalTolerancePositive);
            globalTolerancePositive = Number.isFinite(value) ? value : globalTolerancePositive;
            event.target.value = globalTolerancePositive;
            handleTriOrbFieldChange();
          });
        }

        if (globalToleranceNegativeInput) {
          globalToleranceNegativeInput.addEventListener("input", (event) => {
            const value = parseNumeric(event.target.value, globalToleranceNegative);
            globalToleranceNegative = Number.isFinite(value) ? value : globalToleranceNegative;
            event.target.value = globalToleranceNegative;
            handleTriOrbFieldChange();
          });
        }

        if (fieldOfViewInput) {
          fieldOfViewInput.addEventListener("input", (event) => {
            const nextValue = parseNumeric(event.target.value, fieldOfViewDegrees);
            if (!Number.isFinite(nextValue)) {
              event.target.value = fieldOfViewDegrees;
              return;
            }
            fieldOfViewDegrees = nextValue;
            event.target.value = fieldOfViewDegrees;
            invalidateDeviceTraceCache();
            renderFigure();
          });
        }

        if (addFieldsetDeviceBtn) {
          addFieldsetDeviceBtn.addEventListener("click", () => {
            fieldsetDevices.push(createDefaultFieldsetDevice(fieldsetDevices.length));
            renderFieldsetDevices();
            renderFigure();
          });
        }

        if (fieldsetDevicesContainer) {
          fieldsetDevicesContainer.addEventListener("click", (event) => {
            const removeDevice = event.target.closest("[data-action='remove-fieldset-device']");
            if (removeDevice) {
              if (removeDevice.disabled) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const deviceIndex = Number(removeDevice.dataset.deviceIndex);
              if (fieldsetDevices.length <= 1) {
                setStatus("At least one Fieldset Device must remain.", "warning");
                return;
              }
              fieldsetDevices.splice(deviceIndex, 1);
              renderFieldsetDevices();
              renderFigure();
            }
          });

          const handleDeviceFieldInput = (event) => {
            const target = event.target;
            if (target.classList.contains("fieldset-device-name")) {
              const deviceIndex = Number(target.dataset.deviceIndex);
              const selectedName = target.value;
              const device = fieldsetDevices[deviceIndex];
              if (device) {
                applyScanPlaneDeviceAttributes(device, { deviceName: selectedName });
                renderFieldsetDevices();
                renderFigure();
              }
            } else if (target.classList.contains("fieldset-device-attr")) {
              const deviceIndex = Number(target.dataset.deviceIndex);
              const field = target.dataset.field;
              updateFieldsetDeviceAttribute(
                deviceIndex,
                field,
                resolveStructuredInputValue(target)
              );
            }
          };

          fieldsetDevicesContainer.addEventListener("input", handleDeviceFieldInput);
          fieldsetDevicesContainer.addEventListener("change", handleDeviceFieldInput);
        }

        if (fieldsetGlobalContainer) {
          fieldsetGlobalContainer.addEventListener("input", (event) => {
            const target = event.target;
            if (target.classList.contains("fieldset-global-attr")) {
              const field = target.dataset.field;
              updateGlobalGeometryAttribute(field, resolveStructuredInputValue(target));
            }
          });
        }

        if (casetableConfigurationContainer) {
          casetableConfigurationContainer.addEventListener("input", (event) => {
            const target = event.target;
            if (target.classList.contains("casetable-config-field-input")) {
              const tag = target.dataset.configTag;
              if (tag) {
                setCasetableConfigTextValue(tag, target.value);
              }
              return;
            }
            if (target.classList.contains("casetable-config-input")) {
              const path = target.dataset.configPath;
              const field = target.dataset.configField;
              updateCasetableConfigAttribute(path, field, target.value);
            } else if (target.classList.contains("casetable-config-text")) {
              const path = target.dataset.configPath;
              updateCasetableConfigText(path, target.value);
            }
          });

          casetableConfigurationContainer.addEventListener("click", (event) => {
            const staticToggle = event.target.closest("[data-action='toggle-config-static']");
            if (staticToggle) {
              event.preventDefault();
              const staticIndex = Number(staticToggle.dataset.staticIndex);
              if (!Number.isNaN(staticIndex)) {
                const staticInputs = ensureCasetableConfigStaticInputs();
                const targetNode = staticInputs[staticIndex];
                const currentValue = readConfigurationStaticInputEvaluate(targetNode);
                updateConfigurationStaticInputEvaluate(staticIndex, !currentValue);
                renderCasetableConfiguration();
              }
              return;
            }
            const booleanToggle = event.target.closest("[data-action='toggle-config-boolean']");
            if (booleanToggle) {
              event.preventDefault();
              const tag = booleanToggle.dataset.configTag;
              if (tag) {
                const nextValue = !getCasetableConfigBoolean(tag, false);
                setCasetableConfigBoolean(tag, nextValue);
                renderCasetableConfiguration();
              }
            }
          });
        }

        if (casetableCasesContainer) {
          casetableCasesContainer.addEventListener("input", (event) => {
            const target = event.target;
            if (target.classList.contains("casetable-case-input")) {
              const caseIndex = Number(target.dataset.caseIndex);
              const field = target.dataset.caseField;
              updateCaseAttribute(
                caseIndex,
                field,
                resolveStructuredInputValue(target)
              );
            } else if (target.classList.contains("casetable-speed-range-input")) {
              const caseIndex = Number(target.dataset.caseIndex);
              const field = target.dataset.speedField === "max" ? "max" : "min";
              const normalizedValue = updateCaseSpeedRange(
                caseIndex,
                field,
                target.value
              );
              if (typeof normalizedValue === "string" && normalizedValue !== target.value) {
                target.value = normalizedValue;
              }
            }
          });

          casetableCasesContainer.addEventListener("click", (event) => {
            const removeBtn = event.target.closest("[data-action='remove-case']");
            if (removeBtn) {
              if (removeBtn.disabled) {
                return;
              }
              event.preventDefault();
              if (casetableCases.length <= 1) {
                setStatus("At least one Case is required.", "warning");
                return;
              }
              const caseIndex = Number(removeBtn.dataset.caseIndex);
              casetableCases.splice(caseIndex, 1);
              caseToggleStates.splice(caseIndex, 1);
              renderCasetableCases();
              return;
            }
            const toggleBtn = event.target.closest("[data-action='toggle-static-input']");
            if (toggleBtn) {
              event.preventDefault();
              event.stopPropagation();
              const caseIndex = Number(toggleBtn.dataset.caseIndex);
              const staticIndex = Number(toggleBtn.dataset.staticIndex);
              const value = toggleBtn.dataset.staticValue;
              updateStaticInputValue(caseIndex, staticIndex, value);
              renderCasetableCases();
              return;
            }
            const speedToggle = event.target.closest("[data-action='toggle-speed-activation']");
            if (speedToggle) {
              event.preventDefault();
              event.stopPropagation();
              const caseIndex = Number(speedToggle.dataset.caseIndex);
              const value = speedToggle.dataset.speedMode;
              updateSpeedActivationValue(caseIndex, value);
              renderCasetableCases();
            }
          });
        }

        if (addCasetableCaseBtn) {
          addCasetableCaseBtn.addEventListener("click", () => {
            if (casetableCases.length >= casetableCasesLimit) {
              setStatus(`Case limit of ${casetableCasesLimit} reached.`, "warning");
              return;
            }
            casetableCases.push(createDefaultCasetableCase(casetableCases.length));
            caseToggleStates.push(false);
            renderCasetableCases();
          });
        }

        if (casetableEvalsContainer) {
          casetableEvalsContainer.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (target.classList.contains("eval-userfield-input")) {
              refreshEvalUserFieldOptions(target);
            }
          });

          casetableEvalsContainer.addEventListener("focusin", (event) => {
            const target = event.target;
            if (target.classList.contains("eval-userfield-input")) {
              refreshEvalUserFieldOptions(target);
            }
          });

          casetableEvalsContainer.addEventListener("input", (event) => {
            const target = event.target;
            if (target.classList.contains("eval-attr-input")) {
              const evalIndex = Number(target.dataset.evalIndex);
              const field = target.dataset.evalField;
              updateEvalAttribute(evalIndex, field, target.value);
            } else if (target.classList.contains("eval-basic-input")) {
              const evalIndex = Number(target.dataset.evalIndex);
              const field = target.dataset.evalField;
              updateEvalBasicField(evalIndex, field, target.value);
            } else if (target.classList.contains("eval-reset-input")) {
              const evalIndex = Number(target.dataset.evalIndex);
              const field = target.dataset.resetField;
              updateEvalResetField(evalIndex, field, target.value);
            } else if (target.classList.contains("eval-fieldmode-input")) {
              const evalIndex = Number(target.dataset.evalIndex);
              updateEvalFieldMode(evalIndex, target.value);
            }
          });

          casetableEvalsContainer.addEventListener("change", (event) => {
            const target = event.target;
            if (target.classList.contains("eval-userfield-input")) {
              const evalIndex = Number(target.dataset.evalIndex);
              const caseIndex = Number(target.dataset.caseIndex);
              updateEvalUserFieldId(evalIndex, caseIndex, target.value);
              refreshCaseFieldAssignments({ rerenderCaseToggles: true });
            }
          });

          casetableEvalsContainer.addEventListener("click", (event) => {
            const removeBtn = event.target.closest("[data-action='remove-eval']");
            if (removeBtn) {
              event.preventDefault();
              if (casetableEvals?.evals?.length <= 1) {
                setStatus("At least one Eval is required.", "warning");
                return;
              }
              const evalIndex = Number(removeBtn.dataset.evalIndex);
              casetableEvals.evals.splice(evalIndex, 1);
              renderCasetableEvals();
              return;
            }
            const toggleBtn = event.target.closest("[data-action='toggle-eval-split']");
            if (toggleBtn) {
              event.preventDefault();
              const evalIndex = Number(toggleBtn.dataset.evalIndex);
              const caseIndex = Number(toggleBtn.dataset.caseIndex);
              const value = toggleBtn.dataset.splitValue === "true" ? "true" : "false";
              updateEvalSplitValue(evalIndex, caseIndex, value);
              updateEvalSplitButtons(evalIndex, caseIndex, value);
            }
          });
        }

        if (addCasetableEvalBtn) {
          addCasetableEvalBtn.addEventListener("click", () => {
            if (casetableEvals?.evals?.length >= casetableEvalsLimit) {
              setStatus(`Eval limit of ${casetableEvalsLimit} reached.`, "warning");
              return;
            }
            const defaults = resolveEvalUserFieldOptions();
            const newEval = createDefaultEval(
              casetableEvals.evals.length,
              casetableCases.length,
              defaults
            );
            casetableEvals.evals.push(newEval);
            renderCasetableEvals();
          });
        }

        function resolveCaseSummary(caseIndex) {
          const caseData = casetableCases[caseIndex];
          return caseData?.attributes?.Name || buildCaseName(caseIndex);
        }

        function resolveEvalSummary(evalEntry, evalIndex) {
          return evalEntry?.name || buildEvalName(evalIndex);
        }

        function applyEvalUserFieldValidation() {
          if (!casetableEvalsContainer) {
            return;
          }
          const { values } = resolveEvalUserFieldOptions();
          const inputs = casetableEvalsContainer.querySelectorAll(".eval-userfield-input");
          const invalidValues = new Set();
          inputs.forEach((input) => {
            const value = (input.value || "").trim();
            const isInvalid = Boolean(value) && !values.has(value);
            input.classList.toggle("input-error", isInvalid);
            if (isInvalid) {
              invalidValues.add(value);
            }
          });
          if (casetableEvalsWarning) {
            casetableEvalsWarning.textContent = invalidValues.size
              ? `Unknown UserFieldId indices: ${Array.from(invalidValues).join(", ")}`
              : "";
          }
        }

        function updateEvalSplitButtons(evalIndex, caseIndex, value) {
          if (!casetableEvalsContainer) {
            return;
          }
          const caseNode = casetableEvalsContainer.querySelector(
            `.casetable-eval-case[data-eval-index="${evalIndex}"][data-case-index="${caseIndex}"]`
          );
          if (!caseNode) {
            return;
          }
          const buttons = caseNode.querySelectorAll("[data-action='toggle-eval-split']");
          buttons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.splitValue === value);
          });
        }

        function syncEvalCaseAssignments() {
          if (!casetableEvals?.evals) {
            return;
          }
          const caseCount = casetableCases.length;
          const defaults = resolveEvalUserFieldOptions();
          casetableEvals.evals.forEach((evalEntry) => {
            if (!Array.isArray(evalEntry.cases)) {
              evalEntry.cases = [];
            }
            while (evalEntry.cases.length < caseCount) {
              const newCase = createDefaultEvalCase(evalEntry.cases.length, defaults);
              evalEntry.cases.push(newCase);
            }
            if (evalEntry.cases.length > caseCount) {
              evalEntry.cases.length = caseCount;
            }
            evalEntry.cases.forEach((caseEntry, index) => {
              caseEntry.attributes = caseEntry.attributes || {};
              caseEntry.attributes.Id = String(index);
            });
          });
        }

        function renderEvalCase(evalEntry, evalIndex, caseEntry, caseIndex) {
          const caseName = resolveCaseSummary(caseIndex);
          const scanPlaneId = caseEntry?.scanPlane?.attributes?.Id || "1";
          const userFieldId = caseEntry?.scanPlane?.userFieldId ?? "";
          const isSplitted =
            String(caseEntry?.scanPlane?.isSplitted ?? "false").toLowerCase() === "true"
              ? "true"
              : "false";
          const userFieldOptions = buildEvalUserFieldOptionsHtml(userFieldId);
          const toggleOptions = [
            { value: "true", label: "Split" },
            { value: "false", label: "Full" },
          ]
            .map(
              (option) => `
                  <button
                    type="button"
                    class="toggle-option${isSplitted === option.value ? " is-active" : ""}"
                    data-action="toggle-eval-split"
                    data-eval-index="${evalIndex}"
                    data-case-index="${caseIndex}"
                    data-split-value="${option.value}"
                  >${option.label}</button>`
            )
            .join("");
          return `
            <div class="casetable-eval-case" data-eval-index="${evalIndex}" data-case-index="${caseIndex}">
              <div class="casetable-eval-case-header">
                <span>Case #${caseIndex + 1}</span>
                <span class="casetable-eval-case-summary">${escapeHtml(caseName)}</span>
                <span class="casetable-eval-case-summary">ScanPlane Id: ${escapeHtml(scanPlaneId)}</span>
              </div>
              <div class="casetable-eval-case-fields">
                <div class="casetable-eval-field">
                  <label>UserFieldId (TriOrb index)</label>
                  <select
                    class="casetable-eval-input eval-userfield-input"
                    data-eval-index="${evalIndex}"
                    data-case-index="${caseIndex}"
                  >
                    ${userFieldOptions.html}
                  </select>
                </div>
                <div class="casetable-eval-toggle">
                  <span>IsSplitted</span>
                  <div class="toggle-group">
                    ${toggleOptions}
                  </div>
                </div>
              </div>
            </div>`;
        }

        function renderCasetableEvalCard(evalEntry, evalIndex) {
          const summaryName = resolveEvalSummary(evalEntry, evalIndex);
          const attrId = evalEntry?.attributes?.Id ?? String(evalIndex + 1);
          const reset = normalizeEvalReset(evalEntry?.reset);
          const cases = Array.isArray(evalEntry?.cases) ? evalEntry.cases : [];
          const permanentPreset = normalizePermanentPreset(evalEntry?.permanentPreset);
          const casesHtml = cases
            .map((caseEntry, caseIndex) => renderEvalCase(evalEntry, evalIndex, caseEntry, caseIndex))
            .join("");
          return `
            <div class="casetable-eval-card" data-eval-index="${evalIndex}">
              <details>
                <summary>
                  <span>Eval #${evalIndex + 1}</span>
                  <span class="casetable-eval-summary">${escapeHtml(summaryName)}</span>
                  <button
                    type="button"
                    class="inline-btn inline-danger"
                    data-action="remove-eval"
                    data-eval-index="${evalIndex}"
                  >
                    Remove
                  </button>
                </summary>
                <div class="casetable-eval-body">
                  <div class="casetable-eval-grid">
                    <div class="casetable-eval-field">
                      <label>Id</label>
                      <input
                        type="text"
                        class="casetable-eval-input eval-attr-input"
                        data-eval-index="${evalIndex}"
                        data-eval-field="Id"
                        value="${escapeHtml(attrId)}"
                      />
                    </div>
                    <div class="casetable-eval-field">
                      <label>Name</label>
                      <input
                        type="text"
                        class="casetable-eval-input eval-basic-input"
                        data-eval-index="${evalIndex}"
                        data-eval-field="name"
                        value="${escapeHtml(evalEntry?.name ?? "")}" 
                      />
                    </div>
                    <div class="casetable-eval-field">
                      <label>NameLatin9Key</label>
                      <input
                        type="text"
                        class="casetable-eval-input eval-basic-input"
                        data-eval-index="${evalIndex}"
                        data-eval-field="nameLatin9Key"
                        value="${escapeHtml(evalEntry?.nameLatin9Key ?? "")}" 
                      />
                    </div>
                    <div class="casetable-eval-field">
                      <label>Q</label>
                      <input
                        type="number"
                        class="casetable-eval-input eval-basic-input"
                        data-eval-index="${evalIndex}"
                        data-eval-field="q"
                        value="${escapeHtml(evalEntry?.q ?? String(evalIndex + 1))}"
                      />
                    </div>
                  </div>
                  <div class="casetable-eval-section">
                    <h4>Reset</h4>
                    <div class="casetable-eval-grid">
                      <div class="casetable-eval-field">
                        <label>ResetType</label>
                        <input
                          type="text"
                          class="casetable-eval-input eval-reset-input"
                          data-eval-index="${evalIndex}"
                          data-reset-field="resetType"
                          value="${escapeHtml(reset.resetType)}"
                        />
                      </div>
                      <div class="casetable-eval-field">
                        <label>AutoResetTime</label>
                        <input
                          type="text"
                          class="casetable-eval-input eval-reset-input"
                          data-eval-index="${evalIndex}"
                          data-reset-field="autoResetTime"
                          value="${escapeHtml(reset.autoResetTime)}"
                        />
                      </div>
                      <div class="casetable-eval-field">
                        <label>EvalResetSource</label>
                        <input
                          type="text"
                          class="casetable-eval-input eval-reset-input"
                          data-eval-index="${evalIndex}"
                          data-reset-field="evalResetSource"
                          value="${escapeHtml(reset.evalResetSource)}"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="casetable-eval-section casetable-eval-cases">
                    <h4>Cases</h4>
                    ${casesHtml || '<p class="casetable-help-text">No cases defined.</p>'}
                  </div>
                  <div class="casetable-eval-section">
                    <h4>PermanentPreset</h4>
                    <div class="casetable-eval-grid">
                      <div class="casetable-eval-field">
                        <label>FieldMode</label>
                        <input
                          type="text"
                          class="casetable-eval-input eval-fieldmode-input"
                          data-eval-index="${evalIndex}"
                          value="${escapeHtml(permanentPreset.fieldMode)}"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>`;
        }

        function renderCasetableEvals() {
          if (!casetableEvalsContainer) {
            return;
          }
          const evalEntries = casetableEvals?.evals || [];
          if (casetableEvalCountLabel) {
            casetableEvalCountLabel.textContent = `${evalEntries.length} / ${casetableEvalsLimit}`;
          }
          if (!evalEntries.length) {
            casetableEvalsContainer.innerHTML = '<p class="casetable-help-text">No evals defined.</p>';
          } else {
            casetableEvalsContainer.innerHTML = evalEntries
              .map((entry, index) => renderCasetableEvalCard(entry, index))
              .join("");
            if (evalEntries.length <= 1) {
              const removeButtons = casetableEvalsContainer.querySelectorAll("[data-action='remove-eval']");
              removeButtons.forEach((button) => {
                button.disabled = true;
              });
            }
          }
          if (addCasetableEvalBtn) {
            addCasetableEvalBtn.disabled = evalEntries.length >= casetableEvalsLimit;
          }
          applyEvalUserFieldValidation();
          refreshCaseFieldAssignments();
        }

        function renderCasetableConfiguration() {
          if (!casetableConfigurationContainer) {
            return;
          }
          ensureCasetableConfigurationRoot();
          if (!casetableConfiguration) {
            casetableConfigurationContainer.innerHTML =
              '<p class="casetable-help-text">No configuration nodes.</p>';
            return;
          }
          const nameValue = getCasetableConfigTextValue("Name", "");
          const inputDelayValue = getCasetableConfigTextValue("InputDelay", "");
          const staticInputs = ensureCasetableConfigStaticInputs();
          const staticButtons = staticInputs
            .slice(0, casetableConfigurationStaticInputsCount)
            .map((inputNode, index) => {
              const isActive = readConfigurationStaticInputEvaluate(inputNode);
              return `<button
                type="button"
                class="casetable-config-static-btn${isActive ? " is-active" : ""}"
                data-action="toggle-config-static"
                data-static-index="${index}"
                aria-pressed="${isActive ? "true" : "false"}"
              >${index + 1}</button>`;
            })
            .join("");
          const booleanConfigs = [
            { tag: "UseSpeed", label: "UseSpeed" },
            { tag: "CaseSequenceEnabled", label: "CaseSequenceEnabled" },
            { tag: "ShowPermanentPreset", label: "ShowPermanentPreset" },
          ];
          const booleanButtons = booleanConfigs
            .map((entry) => {
              const isEnabled = getCasetableConfigBoolean(entry.tag, false);
              return `<button
                type="button"
                class="casetable-config-toggle${isEnabled ? " is-active" : ""}"
                data-action="toggle-config-boolean"
                data-config-tag="${escapeHtml(entry.tag)}"
                aria-pressed="${isEnabled ? "true" : "false"}"
              >${escapeHtml(entry.label)}</button>`;
            })
            .join("");
          const formHtml = `
            <div class="casetable-config-form">
              <div class="casetable-config-field">
                <label for="casetable-config-name">Name</label>
                <input
                  id="casetable-config-name"
                  type="text"
                  class="casetable-config-field-input"
                  data-config-tag="Name"
                  value="${escapeHtml(nameValue)}"
                />
              </div>
              <div class="casetable-config-field">
                <label>StaticInputs Evaluate</label>
                <div class="casetable-config-static-grid">${staticButtons}</div>
              </div>
              <div class="casetable-config-field">
                <label for="casetable-config-input-delay">InputDelay</label>
                <input
                  id="casetable-config-input-delay"
                  type="number"
                  step="1"
                  class="casetable-config-field-input"
                  data-config-tag="InputDelay"
                  value="${escapeHtml(inputDelayValue)}"
                />
              </div>
              <div class="casetable-config-field">
                <label>Flags</label>
                <div class="casetable-config-toggle-list">${booleanButtons}</div>
              </div>
            </div>`;
          const children = Array.isArray(casetableConfiguration.children)
            ? casetableConfiguration.children
            : [];
          const remainingNodes = children
            .map((child, index) => {
              if (casetableConfigurationSpecialTags.has(child?.tag)) {
                return "";
              }
              return renderCasetableConfigNode(child, `root.${index}`);
            })
            .filter(Boolean);
          const treeHtml = remainingNodes.length
            ? `<div class="casetable-config-tree">${remainingNodes.join("")}</div>`
            : "";
          casetableConfigurationContainer.innerHTML = `${formHtml}${treeHtml}`;
        }

        function renderCasetableConfigNode(node, path) {
          if (!node) {
            return "";
          }
          const attributes = Object.entries(node.attributes || {});
          const attrHtml = attributes.length
            ? `<div class="casetable-config-attrs">
                ${attributes
                  .map(
                    ([key, value]) => `
                  <div class="casetable-case-field">
                    <label>${escapeHtml(key)}</label>
                    <input
                      type="text"
                      class="casetable-config-input"
                      data-config-path="${path}"
                      data-config-field="${escapeHtml(key)}"
                      value="${escapeHtml(value ?? "")}" 
                    />
                  </div>`
                  )
                  .join("")}
              </div>`
            : '<p class="casetable-help-text">No attributes.</p>';
          const textField =
            typeof node.text === "string" && node.text.length
              ? `<div class="casetable-config-attrs">
                  <div class="casetable-case-field">
                    <label>Text</label>
                    <textarea
                      class="casetable-config-text"
                      data-config-path="${path}"
                      data-config-text="true"
                    >${escapeHtml(node.text)}</textarea>
                  </div>
                </div>`
              : "";
          const childrenHtml = Array.isArray(node.children)
            ? node.children
                .map((child, childIndex) =>
                  renderCasetableConfigNode(child, `${path}.${childIndex}`)
                )
                .join("")
            : "";
          return `
            <div class="casetable-config-node" data-config-node="${path}">
              <details>
                <summary>${escapeHtml(node.tag || "Node")}</summary>
                ${attrHtml}
                ${textField}
                ${childrenHtml ? `<div class="casetable-config-children">${childrenHtml}</div>` : ""}
              </details>
            </div>`;
        }

        function renderCasetableFieldsConfiguration() {
          if (!casetableFieldsConfigurationContainer) {
            return;
          }
          if (!casetableFieldsConfiguration) {
            casetableFieldsConfigurationContainer.innerHTML =
              '<p class="casetable-help-text">FieldsConfiguration は Fieldsets / ScanPlanes から自動生成されます。</p>';
            return;
          }
          casetableFieldsConfigurationContainer.innerHTML = renderFieldsConfigurationNode(
            casetableFieldsConfiguration
          );
        }

        function renderFieldsConfigurationNode(node, level = 0) {
          if (!node) {
            return "";
          }
          const attributes = Object.entries(node.attributes || {});
          const attrBadges = attributes
            .map(
              ([key, value]) =>
                `<span class="fields-config-attr">${escapeHtml(key)}=${escapeHtml(value ?? "")}</span>`
            )
            .join("");
          const attrSummary = attrBadges ? `<span class="fields-config-attrs">${attrBadges}</span>` : "";
          const children = Array.isArray(node.children) ? node.children : [];
          const textValue = typeof node.text === "string" ? node.text : "";

          if (!children.length) {
            return `
              <div class="fields-config-node level-${level}">
                <div class="fields-config-leaf">
                  <span class="fields-config-tag">${escapeHtml(node.tag || "Node")}</span>
                  ${attrSummary}
                  ${textValue ? `<span class="fields-config-value">${escapeHtml(textValue)}</span>` : ""}
                </div>
              </div>`;
          }

          const childHtml = children
            .map((child) => renderFieldsConfigurationNode(child, level + 1))
            .join("");
          return `
            <div class="fields-config-node level-${level}">
              <details>
                <summary>
                  <span class="fields-config-tag">${escapeHtml(node.tag || "Node")}</span>
                  ${attrSummary}
                </summary>
                ${textValue ? `<div class="fields-config-text">${escapeHtml(textValue)}</div>` : ""}
                <div class="fields-config-children">
                  ${childHtml}
                </div>
              </details>
            </div>`;
        }

        function renderCasetableCases() {
          syncEvalCaseAssignments();
          syncBulkEditSelections();
          if (casetableCaseCountLabel) {
            casetableCaseCountLabel.textContent = `${casetableCases.length} / ${casetableCasesLimit}`;
          }
          if (!casetableCasesContainer) {
            renderCasetableEvals();
            return;
          }
          const caseExpansionState = Array.from(
            casetableCasesContainer.querySelectorAll(".casetable-case-card")
          ).reduce((acc, card) => {
            const caseIndex = Number(card.dataset.caseIndex);
            if (Number.isNaN(caseIndex)) {
              return acc;
            }
            const details = card.querySelector("details");
            if (details) {
              acc[caseIndex] = details.open;
            }
            return acc;
          }, {});
          if (!casetableCases.length) {
            casetableCasesContainer.innerHTML =
              '<p class="casetable-help-text">No cases defined.</p>';
          } else {
            casetableCasesContainer.innerHTML = casetableCases
              .map((caseData, caseIndex) => renderCasetableCase(caseData, caseIndex))
              .join("");
          }
          Object.entries(caseExpansionState).forEach(([caseIndex, isOpen]) => {
            if (!isOpen) {
              return;
            }
            const details = casetableCasesContainer.querySelector(
              `.casetable-case-card[data-case-index="${caseIndex}"] details`
            );
            if (details) {
              details.open = true;
            }
          });
          if (addCasetableCaseBtn) {
            addCasetableCaseBtn.disabled = casetableCases.length >= casetableCasesLimit;
          }
          ensureCaseToggleStateLength();
          renderCasetableEvals();
          renderCaseCheckboxes();
          updateReplicateButtonState();
        }

        function renderCasetableCase(caseData, caseIndex) {
          const attributes = Object.entries(caseData.attributes || {}).filter(
            ([key]) => key !== "Id" && key !== "DisplayOrder"
          );
          const attrFields = attributes.length
            ? `<div class="casetable-case-grid">
                ${attributes
                  .map(([key, value]) => `
                  <div class="casetable-case-field">
                    <label>${escapeHtml(key)}</label>
                    ${renderStructureInput("casetableCase", key, value, {
                      className: "casetable-case-input",
                      dataset: { "case-index": caseIndex, "case-field": key },
                      name: `casetable-case-${caseIndex}-${key}`,
                    })}
                  </div>`)
                  .join("")}
              </div>`
            : '<p class="casetable-help-text">No editable attributes.</p>';
          const staticInputsSection = caseData.staticInputs?.length
            ? `<div class="casetable-static-inputs">
                ${caseData.staticInputs
                  .map((input, staticIndex) =>
                    renderStaticInputToggle(caseIndex, staticIndex, input)
                  )
                  .join("")}
              </div>`
            : '<p class="casetable-help-text">No static inputs defined.</p>';
          let speedActivationSection = "";
          if (caseData.speedActivation) {
            const currentValue = String(
              caseData.speedActivation.attributes?.[
                caseData.speedActivation.modeKey
              ] ?? ""
            ).toLowerCase();
            const toggleButtons = ["Off", "SpeedRange"]
              .map((option) => {
                const isActive = currentValue === option.toLowerCase();
                return `<button
                  type="button"
                  class="toggle-option${isActive ? " is-active" : ""}"
                  data-action="toggle-speed-activation"
                  data-case-index="${caseIndex}"
                  data-speed-mode="${option}"
                >${option}</button>`;
              })
              .join("");
            const minSpeedValue = escapeHtml(getCaseSpeedRangeValue(caseData, "min"));
            const maxSpeedValue = escapeHtml(getCaseSpeedRangeValue(caseData, "max"));
            speedActivationSection = `<div class="casetable-speed-activation">
                <div class="casetable-speed-toggle">
                  <label>SpeedActivation</label>
                  <div class="toggle-group">${toggleButtons}</div>
                </div>
                <div class="casetable-speed-range-fields">
                  <div class="casetable-case-field">
                    <label>MinSpeed</label>
                    <input
                      type="number"
                      class="casetable-speed-range-input"
                      data-case-index="${caseIndex}"
                      data-speed-field="min"
                      min="-20000"
                      max="20000"
                      step="10"
                      value="${minSpeedValue}"
                    />
                  </div>
                  <div class="casetable-case-field">
                    <label>MaxSpeed</label>
                    <input
                      type="number"
                      class="casetable-speed-range-input"
                      data-case-index="${caseIndex}"
                      data-speed-field="max"
                      min="-20000"
                      max="20000"
                      step="10"
                      value="${maxSpeedValue}"
                    />
                  </div>
                </div>
              </div>`;
          }
          const hasReadonlyNodes = Array.isArray(caseData.layout)
            ? caseData.layout.some((segment) => segment.kind === "node")
            : false;
          const summaryName = caseData.attributes?.Name || buildCaseName(caseIndex);
          const canRemoveCase = casetableCases.length > 1;
          return `
            <div class="casetable-case-card" data-case-index="${caseIndex}">
              <details>
                <summary>
                  <span>Case #${caseIndex + 1}</span>
                  <span class="casetable-case-summary">${escapeHtml(summaryName)}</span>
                  <button
                    type="button"
                    class="inline-btn inline-danger"
                    data-action="remove-case"
                    data-case-index="${caseIndex}"
                    ${canRemoveCase ? "" : "disabled"}
                  >
                    Remove
                  </button>
                </summary>
                <div class="casetable-case-body">
                  ${attrFields}
                  ${staticInputsSection}
                  ${speedActivationSection || ""}
                  ${
                    hasReadonlyNodes
                      ? '<p class="casetable-readonly-note">Additional nodes will be preserved when saving.</p>'
                      : ""
                  }
                </div>
              </details>
            </div>`;
        }

        function renderStaticInputToggle(caseIndex, staticIndex, input) {
          const attributes = input?.attributes || {};
          const label = attributes.Name || `StaticInput ${staticIndex + 1}`;
          const key = input?.valueKey || resolveStaticInputValueKey(attributes);
          const currentValue = String(attributes[key] ?? "DontCare").toLowerCase();
          const options = ["DontCare", "Low", "High"];
          const buttons = options
            .map((option) => {
              const isActive = currentValue === option.toLowerCase();
              return `<button
                type="button"
                class="toggle-option${isActive ? " is-active" : ""}"
                data-action="toggle-static-input"
                data-case-index="${caseIndex}"
                data-static-index="${staticIndex}"
                data-static-value="${option}"
              >${option}</button>`;
            })
            .join("");
          return `
            <div class="casetable-static-group">
              <span class="casetable-static-label">${escapeHtml(label)}</span>
              <div class="toggle-group">${buttons}</div>
            </div>`;
        }

        function syncBulkEditSelections() {
          const maxCaseIndex = casetableCases.length - 1;
          bulkEditState.selectedCases.forEach((caseIndex) => {
            if (caseIndex < 0 || caseIndex > maxCaseIndex) {
              bulkEditState.selectedCases.delete(caseIndex);
            }
          });
          const maxShapeIndex = triorbShapes.length - 1;
          bulkEditState.selectedShapes.forEach((shapeIndex) => {
            if (shapeIndex < 0 || shapeIndex > maxShapeIndex) {
              bulkEditState.selectedShapes.delete(shapeIndex);
            }
          });
        }

        function renderBulkEditCaseToggles() {
          if (!bulkEditCaseToggles) {
            return;
          }
          if (!casetableCases.length) {
            bulkEditCaseToggles.innerHTML = '<p class="toggle-pill-empty">No cases available.</p>';
            return;
          }
          bulkEditCaseToggles.innerHTML = casetableCases
            .map((caseData, caseIndex) => {
              const isActive = bulkEditState.selectedCases.has(caseIndex);
              const name = caseData.attributes?.Name || buildCaseName(caseIndex);
              return `
                <button
                  type="button"
                  class="toggle-pill-btn${isActive ? " active" : ""}"
                  data-bulk-toggle="case"
                  data-index="${caseIndex}"
                  aria-pressed="${isActive}"
                >
                  ${escapeHtml(name)}
                </button>`;
            })
            .join("");
        }

        function renderBulkEditShapeToggles() {
          if (!bulkEditShapeToggles) {
            return;
          }
          if (!triorbShapes.length) {
            bulkEditShapeToggles.innerHTML = '<p class="toggle-pill-empty">No shapes available.</p>';
            return;
          }
          bulkEditShapeToggles.innerHTML = triorbShapes
            .map((shape, shapeIndex) => {
              const isActive = bulkEditState.selectedShapes.has(shapeIndex);
              const name = shape.name || shape.id || `Shape ${shapeIndex + 1}`;
              return `
                <button
                  type="button"
                  class="toggle-pill-btn${isActive ? " active" : ""}"
                  data-bulk-toggle="shape"
                  data-index="${shapeIndex}"
                  aria-pressed="${isActive}"
                >
                  ${shapeIndex + 1}. ${escapeHtml(name)}
                </button>`;
            })
            .join("");
        }

          function resetBulkEditForm() {
            bulkEditState.selectedCases.clear();
            bulkEditState.selectedShapes.clear();
            bulkEditState.lastCaseIndex = null;
            bulkEditState.lastShapeIndex = null;
            if (bulkStaticNumberInput) {
              bulkStaticNumberInput.value = "1";
            }
            if (bulkStaticValueSelect) {
              bulkStaticValueSelect.value = "DontCare";
            }
            [
              bulkShapeOutsetInput,
              bulkShapeMoveXInput,
              bulkShapeMoveYInput,
            ].forEach((input) => {
              if (input) {
                input.value = "0";
            }
          });
          renderBulkEditCaseToggles();
          renderBulkEditShapeToggles();
          renderFigure();
        }

        function handleBulkToggleClick(event) {
          const button = event.target.closest("[data-bulk-toggle]");
          if (!button) {
            return;
          }
          const targetType = button.dataset.bulkToggle;
          const index = Number(button.dataset.index);
          if (!Number.isInteger(index)) {
            return;
          }
          const isCase = targetType === "case";
          const maxIndex = isCase ? casetableCases.length - 1 : triorbShapes.length - 1;
          if (index < 0 || index > maxIndex) {
            return;
          }
          const selection = isCase ? bulkEditState.selectedCases : bulkEditState.selectedShapes;
          const lastKey = isCase ? "lastCaseIndex" : "lastShapeIndex";
          const lastIndex = bulkEditState[lastKey];
          if (event.shiftKey && Number.isInteger(lastIndex)) {
            const start = Math.max(0, Math.min(lastIndex, index));
            const end = Math.min(maxIndex, Math.max(lastIndex, index));
            for (let cursor = start; cursor <= end; cursor += 1) {
              selection.add(cursor);
            }
          } else if (selection.has(index)) {
            selection.delete(index);
          } else {
            selection.add(index);
          }
          bulkEditState[lastKey] = index;
          if (isCase) {
            renderBulkEditCaseToggles();
          } else {
            renderBulkEditShapeToggles();
          }
          renderFigure();
        }

        function applyBulkCaseStaticInputs(staticIndex, staticValue) {
          let updated = 0;
          bulkEditState.selectedCases.forEach((caseIndex) => {
            const caseData = casetableCases[caseIndex];
            if (!caseData) {
              return;
            }
            caseData.staticInputs = normalizeStaticInputs(caseData.staticInputs);
            updateStaticInputValue(caseIndex, staticIndex, staticValue);
            updated += 1;
          });
          return updated;
        }

        function applyBulkShapeAdjustments(delta, offsetX, offsetY) {
          let changedCount = 0;
          bulkEditState.selectedShapes.forEach((shapeIndex) => {
            const shape = triorbShapes[shapeIndex];
            if (!shape) {
              return;
            }
            let changed = false;
            if (delta !== 0) {
              changed = applyShapeInsetOutset(shape, delta) || changed;
            }
            if (offsetX || offsetY) {
              applyReplicationTransform(shape, { offsetX, offsetY });
              changed = true;
            }
            if (changed) {
              changedCount += 1;
            }
          });
          if (changedCount) {
            invalidateTriOrbShapeCaches();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            renderFieldsets();
            renderFigure();
          }
          return changedCount;
        }

        function applyBulkEditChanges() {
          syncBulkEditSelections();
          let staticNumber = Math.round(parseNumeric(bulkStaticNumberInput?.value, 1) || 1);
          staticNumber = Math.min(casetableConfigurationStaticInputsCount, Math.max(1, staticNumber));
          if (bulkStaticNumberInput) {
            bulkStaticNumberInput.value = String(staticNumber);
          }
          const staticValue = bulkStaticValueSelect?.value || "DontCare";
          const { delta, offsetX: moveX, offsetY: moveY } = resolveBulkShapeTransform();
          const updatedCases = applyBulkCaseStaticInputs(staticNumber - 1, staticValue);
          const updatedShapes = applyBulkShapeAdjustments(delta, moveX, moveY);
          if (!updatedCases && !updatedShapes) {
            setStatus("一括編集の対象が選択されていません。", "warning");
            return;
          }
          if (updatedCases) {
            renderCasetableCases();
          }
          const messages = [];
          if (updatedCases) {
            messages.push(`Cases: ${updatedCases} 件更新`);
          }
          if (updatedShapes) {
            messages.push(`Shapes: ${updatedShapes} 件更新`);
          }
          setStatus(messages.join(" / "), "ok");
          closeBulkEditModal();
        }

        function resetBulkEditModalTransform() {
          bulkEditModalOffsetX = 0;
          bulkEditModalOffsetY = 0;
          bulkEditModalLastDx = 0;
          bulkEditModalLastDy = 0;
          if (bulkEditModalWindow) {
            bulkEditModalWindow.style.transform = "translate(0px, 0px)";
            bulkEditModalWindow.style.width = "";
            bulkEditModalWindow.style.height = "";
          }
        }

        function openBulkEditModal() {
          if (!bulkEditModal) {
            return;
          }
          resetBulkEditForm();
          resetBulkEditModalTransform();
          bulkEditModal.classList.add("active");
          bulkEditModal.setAttribute("aria-hidden", "false");
        }

        function closeBulkEditModal() {
          if (!bulkEditModal) {
            return;
          }
          resetBulkEditForm();
          bulkEditModal.classList.remove("active");
          bulkEditModal.setAttribute("aria-hidden", "true");
        }

        function renderFieldsetCheckboxes() {
          if (!fieldsetCheckboxes) {
            return;
          }
          if (!fieldsets.length) {
            fieldsetCheckboxes.innerHTML = '<p class="toggle-pill-empty">No fieldsets available.</p>';
            return;
          }
          fieldsetCheckboxes.innerHTML = fieldsets
            .map((fieldset, index) => {
              const isVisible = fieldset.visible !== false;
              return `
              <button
                type="button"
                class="toggle-pill-btn${isVisible ? " active" : ""}"
                data-fieldset-index="${index}"
                aria-pressed="${isVisible}"
              >
                ${escapeHtml(fieldset.attributes?.Name || `Fieldset ${index + 1}`)}
              </button>`;
            })
            .join("");
        }

        function ensureCaseToggleStateLength() {
          const desiredLength = casetableCases.length;
          if (caseToggleStates.length === desiredLength) {
            return;
          }
          const nextStates = new Array(desiredLength).fill(false);
          for (let index = 0; index < desiredLength; index += 1) {
            nextStates[index] = caseToggleStates[index] ?? false;
          }
          caseToggleStates = nextStates;
        }

        function renderCaseCheckboxes() {
          if (!caseCheckboxes) {
            return;
          }
          ensureCaseToggleStateLength();
          if (!casetableCases.length) {
            caseCheckboxes.innerHTML = '<p class="toggle-pill-empty">No cases available.</p>';
            return;
          }
          caseCheckboxes.innerHTML = casetableCases
            .map((caseData, index) => {
              const isActive = caseToggleStates[index];
              const label = caseData.attributes?.Name || buildCaseName(index);
              return `
                <button
                  type="button"
                  class="toggle-pill-btn${isActive ? " active" : ""}"
                  data-case-index="${index}"
                  aria-pressed="${isActive}"
                >
                  ${escapeHtml(label)}
                </button>`;
            })
            .join("");
        }

        function buildUserFieldLookup() {
          const lookup = new Map();
          const userFieldDefinitions = collectUserFieldDefinitions();
          userFieldDefinitions.forEach((definition) => {
            if (!Number.isFinite(definition.fieldsetIndex)) {
              return;
            }
            lookup.set(definition.id, [definition.fieldsetIndex]);
          });
          return lookup;
        }

        function applyCaseToggleVisibility({ rerenderFieldsetToggles = true, rerenderFigure = true } = {}) {
          fieldsets.forEach((fieldset) => {
            fieldset.forcedVisibleCount = 0;
          });
          caseToggleStates.forEach((isActive, caseIndex) => {
            if (!isActive) {
              return;
            }
            const assignments = caseFieldAssignments[caseIndex];
            if (!assignments || !assignments.size) {
              return;
            }
            assignments.forEach((fieldsetIndex) => {
              const fieldset = fieldsets[fieldsetIndex];
              if (!fieldset) {
                return;
              }
              fieldset.forcedVisibleCount = (Number(fieldset.forcedVisibleCount) || 0) + 1;
            });
          });
          let visibilityChanged = false;
          fieldsets.forEach((fieldset) => {
            if (syncFieldsetVisibility(fieldset)) {
              visibilityChanged = true;
            }
          });
          if (rerenderFieldsetToggles) {
            renderFieldsetCheckboxes();
          }
          if (visibilityChanged && rerenderFigure) {
            renderFigure();
          }
        }

        function refreshCaseFieldAssignments({
          applyVisibility = true,
          rerenderFieldsetToggles = true,
          rerenderFigure = true,
          rerenderCaseToggles = false,
        } = {}) {
          const lookup = buildUserFieldLookup();
          caseFieldAssignments = casetableCases.map((_, caseIndex) => {
            const assignment = new Set();
            const evalEntries = Array.isArray(casetableEvals?.evals) ? casetableEvals.evals : [];
            evalEntries.forEach((evalEntry) => {
              const evalCase = evalEntry?.cases?.[caseIndex];
              if (!evalCase) {
                return;
              }
              const userFieldId = String(evalCase.scanPlane?.userFieldId ?? "").trim();
              if (!userFieldId) {
                return;
              }
              const fieldsetIndexes = lookup.get(userFieldId);
              if (fieldsetIndexes && fieldsetIndexes.length) {
                fieldsetIndexes.forEach((fieldsetIndex) => {
                  assignment.add(fieldsetIndex);
                });
              }
            });
            return assignment;
          });
          if (applyVisibility) {
            applyCaseToggleVisibility({
              rerenderFieldsetToggles,
              rerenderFigure,
            });
          }
          if (rerenderCaseToggles) {
            renderCaseCheckboxes();
          }
        }

        function toggleCaseVisibility(caseIndex, nextState) {
          ensureCaseToggleStateLength();
          if (caseToggleStates[caseIndex] === nextState) {
            return;
          }
          caseToggleStates[caseIndex] = nextState;
          const caseName = casetableCases[caseIndex]?.attributes?.Name || buildCaseName(caseIndex);
          const assignments = caseFieldAssignments[caseIndex];
          if (!assignments || !assignments.size) {
            setStatus(`${caseName} に紐づく Field が見つかりません。`, "warning");
          } else {
            setStatus(
              `${caseName} を ${nextState ? "表示" : "非表示"} ケースに切り替えました。`,
              nextState ? "ok" : "warning"
            );
          }
          applyCaseToggleVisibility({ rerenderFieldsetToggles: true, rerenderFigure: true });
          renderCaseCheckboxes();
        }

        function setAllCaseToggles(active) {
          ensureCaseToggleStateLength();
          caseToggleStates = caseToggleStates.map(() => active);
          applyCaseToggleVisibility({ rerenderFieldsetToggles: true, rerenderFigure: true });
          renderCaseCheckboxes();
          setStatus(
            active ? "All cases activated." : "All cases deactivated.",
            active ? "ok" : "warning"
          );
        }

        function deleteVisibleCases() {
          ensureCaseToggleStateLength();
          const activeIndexes = caseToggleStates
            .map((isActive, index) => (isActive ? index : -1))
            .filter((index) => index >= 0);
          if (!activeIndexes.length) {
            setStatus("表示中の Case はありません。", "warning");
            return;
          }
          if (activeIndexes.length >= casetableCases.length) {
            setStatus("At least one Case is required.", "warning");
            return;
          }
          const sortedIndexes = activeIndexes.sort((a, b) => b - a);
          sortedIndexes.forEach((caseIndex) => {
            casetableCases.splice(caseIndex, 1);
            caseToggleStates.splice(caseIndex, 1);
          });
          casetableCases.forEach((caseEntry, index) => {
            if (caseEntry?.attributes) {
              caseEntry.attributes.DisplayOrder = String(index);
            }
          });
          casetableEvals = normalizeCasetableEvals(casetableEvals, casetableCases.length);
          renderCasetableCases();
          renderCasetableEvals();
          refreshCaseFieldAssignments({ rerenderCaseToggles: true });
          setStatus(`${activeIndexes.length} 件の表示中 Case を削除しました。`, "ok");
        }

        if (caseCheckboxes) {
          caseCheckboxes.addEventListener("click", (event) => {
            const button = event.target.closest(".toggle-pill-btn");
            if (!button || button.dataset.caseIndex === undefined) {
              return;
            }
            event.preventDefault();
            const caseIndex = Number(button.dataset.caseIndex);
            const nextState = !button.classList.contains("active");
            toggleCaseVisibility(caseIndex, nextState);
          });
        }

        if (caseCheckAllBtn) {
          caseCheckAllBtn.addEventListener("click", () => {
            setAllCaseToggles(true);
          });
        }

        if (caseUncheckAllBtn) {
          caseUncheckAllBtn.addEventListener("click", () => {
            setAllCaseToggles(false);
          });
        }

        if (caseDeleteVisibleBtn) {
          caseDeleteVisibleBtn.addEventListener("click", deleteVisibleCases);
        }

        if (fieldsetCheckboxes) {
          fieldsetCheckboxes.addEventListener("click", (event) => {
            const button = event.target.closest(".toggle-pill-btn");
            if (!button || button.dataset.fieldsetIndex === undefined) {
              return;
            }
            event.preventDefault();
            const index = Number(button.dataset.fieldsetIndex);
            const fieldset = fieldsets[index];
            if (!fieldset) {
              return;
            }
            const nextState = !button.classList.contains("active");
            if (!nextState && (fieldset.forcedVisibleCount || 0) > 0) {
              const lockedName = fieldset.attributes?.Name || `Fieldset ${index + 1}`;
              setStatus(
                `${lockedName} は Case トグルで表示中です。Case の表示を解除してください。`,
                "warning"
              );
              return;
            }
            setFieldsetUserVisibility(fieldset, nextState);
            renderFieldsetCheckboxes();
            const fieldsetName = fieldset.attributes?.Name || `Fieldset ${index + 1}`;
            setStatus(
              `${fieldsetName} を ${nextState ? "表示" : "非表示"} にしました。`,
              nextState ? "ok" : "warning"
            );
            renderFigure();
          });
        }

        if (checkAllBtn) {
          checkAllBtn.addEventListener("click", () => {
            toggleAllFieldsetCheckboxes(true);
          });
        }

        if (uncheckAllBtn) {
          uncheckAllBtn.addEventListener("click", () => {
            toggleAllFieldsetCheckboxes(false);
          });
        }

        if (fieldDeleteVisibleBtn) {
          fieldDeleteVisibleBtn.addEventListener("click", deleteVisibleFields);
        }

        if (triorbShapeCheckboxes) {
          triorbShapeCheckboxes.addEventListener("click", (event) => {
            const button = event.target.closest(".toggle-pill-btn");
            if (!button || !button.dataset.shapeIndex) {
              return;
            }
            event.preventDefault();
            const index = Number(button.dataset.shapeIndex);
            const shape = triorbShapes[index];
            if (!shape) {
              return;
            }
            const nextState = !button.classList.contains("active");
            button.classList.toggle("active", nextState);
            button.setAttribute("aria-pressed", String(nextState));
            shape.visible = nextState;
            invalidateTriOrbShapeCaches();
            renderFigure();
          });
        }

        if (triorbShapeCheckAllBtn) {
          triorbShapeCheckAllBtn.addEventListener("click", () => {
            setTriOrbShapeVisibility(true);
          });
        }

        if (triorbShapeUncheckAllBtn) {
          triorbShapeUncheckAllBtn.addEventListener("click", () => {
            setTriOrbShapeVisibility(false);
          });
        }

        if (triorbShapeDeleteVisibleBtn) {
          triorbShapeDeleteVisibleBtn.addEventListener("click", deleteVisibleTriOrbShapes);
        }

        function ensureInlineGeometryForShape(field, shape) {
          if (!field || !shape || triOrbImportContext.triOrbRootFound) {
            return;
          }
          const existingKeys = new Set();
          const addExistingKey = (type, attrs, points = []) => {
            const key = buildShapeKey(type, attrs, points);
            if (key) {
              existingKeys.add(key);
            }
          };
          (field.polygons || []).forEach((polygon) => {
            const polygonAttrs = polygon.attributes || { Type: polygon.Type };
            const normalizedPoints = (polygon.points || []).map((point) => ({
              X: String(point.X ?? point.x ?? "0"),
              Y: String(point.Y ?? point.y ?? "0"),
            }));
            addExistingKey("Polygon", { Type: polygonAttrs.Type || "Field" }, normalizedPoints);
          });
          (field.rectangles || []).forEach((rectangle) => {
            addExistingKey("Rectangle", rectangle, []);
          });
          (field.circles || []).forEach((circle) => {
            addExistingKey("Circle", circle, []);
          });

          const appendGeometry = (type, attrs, points = []) => {
            const key = buildShapeKey(type, attrs, points);
            if (!key || existingKeys.has(key)) {
              return;
            }
            if (type === "Polygon") {
              field.polygons = field.polygons || [];
              field.polygons.push({ attributes: attrs, points });
            } else if (type === "Rectangle") {
              field.rectangles = field.rectangles || [];
              field.rectangles.push(attrs);
            } else if (type === "Circle") {
              field.circles = field.circles || [];
              field.circles.push(attrs);
            }
            existingKeys.add(key);
          };

          if (shape.type === "Polygon" && shape.polygon) {
            const attrs = { Type: getPolygonTypeValue(shape.polygon) || shape.polygon.Type || "Field" };
            const points = (shape.polygon.points || []).map((point) => ({
              X: String(point.X ?? point.x ?? "0"),
              Y: String(point.Y ?? point.y ?? "0"),
            }));
            appendGeometry("Polygon", attrs, points);
          } else if (shape.type === "Rectangle" && shape.rectangle) {
            appendGeometry("Rectangle", { ...shape.rectangle }, []);
          } else if (shape.type === "Circle" && shape.circle) {
            appendGeometry("Circle", { ...shape.circle }, []);
          }
        }

        function addFieldShapeRef(fieldsetIndex, fieldIndex, shapeId) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field || !shapeId) {
            return;
          }
          field.shapeRefs = field.shapeRefs || [];
          if (field.shapeRefs.some((ref) => ref.shapeId === shapeId)) {
            return;
          }
          field.shapeRefs.push({ shapeId });
          const resolvedShape =
            findTriOrbShapeById(shapeId) || triorbShapes.find((shape) => shape.id === shapeId);
          ensureInlineGeometryForShape(field, resolvedShape);
          renderFieldsets();
        }

        function removeFieldShapeRef(fieldsetIndex, fieldIndex, shapeIndex) {
          const field = getFieldEntry(fieldsetIndex, fieldIndex);
          if (!field || !Array.isArray(field.shapeRefs)) {
            return;
          }
          field.shapeRefs.splice(shapeIndex, 1);
          renderFieldsets();
        }

        function openTriOrbShapeEditor(shapeId) {
          const shapeIndex = triorbShapes.findIndex((shape) => shape.id === shapeId);
          if (shapeIndex < 0) {
            return;
          }
          openCreateShapeModalForEdit(shapeId);
        }

        const handleFieldsetInput = (event) => {
          const target = event.target;
          if (!target) return;
          if (target.classList.contains("fieldset-attr")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const field = target.dataset.field;
            updateFieldsetAttribute(fieldsetIndex, field, target.value);
          } else if (target.classList.contains("field-attr")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const field = target.dataset.field;
            updateFieldAttribute(fieldsetIndex, fieldIndex, field, target.value);
          } else if (target.classList.contains("polygon-type")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const polygonIndex = Number(target.dataset.polygonIndex);
            updatePolygonAttribute(fieldsetIndex, fieldIndex, polygonIndex, "Type", target.value);
          } else if (target.classList.contains("polygon-point")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const polygonIndex = Number(target.dataset.polygonIndex);
            const pointIndex = Number(target.dataset.pointIndex);
            const axis = target.dataset.axis === "Y" ? "Y" : "X";
            updatePolygonPoint(fieldsetIndex, fieldIndex, polygonIndex, pointIndex, axis, target.value);
          } else if (target.classList.contains("rectangle-type")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const rectangleIndex = Number(target.dataset.rectangleIndex);
            updateRectangleAttribute(fieldsetIndex, fieldIndex, rectangleIndex, "Type", target.value);
          } else if (target.classList.contains("rectangle-attr")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const rectangleIndex = Number(target.dataset.rectangleIndex);
            const field = target.dataset.field;
            updateRectangleAttribute(fieldsetIndex, fieldIndex, rectangleIndex, field, target.value);
          } else if (target.classList.contains("circle-type")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const circleIndex = Number(target.dataset.circleIndex);
            updateCircleAttribute(fieldsetIndex, fieldIndex, circleIndex, "Type", target.value);
          } else if (target.classList.contains("circle-attr")) {
            const fieldsetIndex = Number(target.dataset.fieldsetIndex);
            const fieldIndex = Number(target.dataset.fieldIndex);
            const circleIndex = Number(target.dataset.circleIndex);
            const field = target.dataset.field;
            updateCircleAttribute(fieldsetIndex, fieldIndex, circleIndex, field, target.value);
          }
          };

        if (fieldsetsContainer) {
          fieldsetsContainer.addEventListener("click", (event) => {
            const actionTarget = event.target.closest("[data-action]");
            if (!actionTarget) {
              return;
            }
            if (actionTarget.disabled) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const action = actionTarget.dataset.action;
            switch (action) {
              case "remove-fieldset": {
                const fieldsetIndex = Number(actionTarget.dataset.fieldsetIndex);
                if (fieldsets.length <= 1) {
                  setStatus("At least one Fieldset must remain.", "warning");
                  break;
                }
                fieldsets.splice(fieldsetIndex, 1);
                renderFieldsets();
                break;
              }
              case "add-field": {
                const fieldsetIndex = Number(actionTarget.dataset.fieldsetIndex);
                openCreateFieldModalForCreate(fieldsetIndex);
                break;
              }
              case "remove-field": {
                const fieldsetIndex = Number(actionTarget.dataset.fieldsetIndex);
                const fieldIndex = Number(actionTarget.dataset.fieldIndex);
                const fieldset = fieldsets[fieldsetIndex];
                if (!fieldset || !fieldset.fields || fieldset.fields.length <= 1) {
                  setStatus("Each Fieldset requires at least one Field.", "warning");
                  break;
                }
                if (fieldset.fields) {
                  fieldset.fields.splice(fieldIndex, 1);
                  renderFieldsets();
                }
                break;
              }
              case "edit-field": {
                const fieldsetIndex = Number(actionTarget.dataset.fieldsetIndex);
                const fieldIndex = Number(actionTarget.dataset.fieldIndex);
                openCreateFieldModalForEdit(fieldsetIndex, fieldIndex);
                break;
              }
              case "add-field-shape": {
                const fieldsetIndex = Number(actionTarget.dataset.fieldsetIndex);
                const fieldIndex = Number(actionTarget.dataset.fieldIndex);
                const select = actionTarget
                  .closest(".shape-controls")
                  ?.querySelector(".field-shape-selector");
                const shapeId = select?.value;
                addFieldShapeRef(fieldsetIndex, fieldIndex, shapeId);
                break;
              }
              case "remove-field-shape": {
                const fieldsetIndex = Number(actionTarget.dataset.fieldsetIndex);
                const fieldIndex = Number(actionTarget.dataset.fieldIndex);
                const shapeIndex = Number(actionTarget.dataset.shapeIndex);
                removeFieldShapeRef(fieldsetIndex, fieldIndex, shapeIndex);
                break;
              }
              case "edit-field-shape": {
                openTriOrbShapeEditor(actionTarget.dataset.shapeId);
                break;
              }
              default:
                break;
            }
          });

          fieldsetsContainer.addEventListener("input", (event) => {
            handleFieldsetInput(event);
          });
          fieldsetsContainer.addEventListener("change", (event) => {
            handleFieldsetInput(event);
          });
        }

        let triOrbSpinnerTimer = null;
        let triOrbSpinnerStep = null;

        if (triorbShapesContainer) {
          triorbShapesContainer.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (
              target instanceof HTMLInputElement &&
              target.type === "number" &&
              target.closest(".triorb-shape-card")
            ) {
              const rect = target.getBoundingClientRect();
              const isUp = event.clientY < rect.top + rect.height / 2;
              const stepFn = () => {
                if (isUp) {
                  target.stepUp();
                } else {
                  target.stepDown();
                }
                handleTriOrbShapeInput({ target });
              };
              stepFn();
              triOrbSpinnerStep = stepFn;
              triOrbSpinnerTimer = setInterval(stepFn, 140);
            }
          });
          document.addEventListener("pointerup", () => {
            if (triOrbSpinnerTimer) {
              clearInterval(triOrbSpinnerTimer);
              triOrbSpinnerTimer = null;
              triOrbSpinnerStep = null;
            }
          });
          triorbShapesContainer.addEventListener("input", (event) => {
            handleTriOrbShapeInput(event);
          });
          triorbShapesContainer.addEventListener("change", (event) => {
            handleTriOrbShapeInput(event);
          });
          triorbShapesContainer.addEventListener("click", (event) => {
            if (!event.target) return;
            const action = event.target.dataset.action;
            if (action === "remove-triorb-shape") {
              const index = Number(event.target.dataset.shapeIndex);
              removeTriOrbShape(index);
            }
          });
        }

        if (addTriOrbShapeBtn) {
          addTriOrbShapeBtn.addEventListener("click", () => {
            const shape = createDefaultTriOrbShape(triorbShapes.length);
            triorbShapes.push(shape);
            registerTriOrbShapeInRegistry(shape, triorbShapes.length - 1);
            invalidateTriOrbShapeCaches();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            renderFieldsets();
          });
        }

        function toggleAllFieldsetCheckboxes(checked) {
          let lockedCount = 0;
          fieldsets.forEach((fieldset) => {
            if (!checked && (fieldset.forcedVisibleCount || 0) > 0) {
              lockedCount += 1;
            }
            setFieldsetUserVisibility(fieldset, checked);
          });
          renderFieldsetCheckboxes();
          const message = checked
            ? "All fieldsets checked."
            : lockedCount
            ? `All fieldsets unchecked. ${lockedCount} fieldset(s) remain visible due to Case filters.`
            : "All fieldsets unchecked.";
          setStatus(message, checked ? "ok" : lockedCount ? "warning" : "warning");
          renderFigure();
        }

        function deleteVisibleFields() {
          let removed = 0;
          let preservedFieldsets = 0;
          fieldsets.forEach((fieldset) => {
            if (!fieldset || fieldset.visible === false || !Array.isArray(fieldset.fields)) {
              return;
            }
            const remaining = [];
            fieldset.fields.forEach((field) => {
              const hasVisibleShape = (field.shapeRefs || []).some((ref) => {
                const shape = findTriOrbShapeById(ref?.shapeId);
                return shape && shape.visible !== false;
              });
              if (!hasVisibleShape) {
                remaining.push(field);
              }
            });
            if (!remaining.length && fieldset.fields.length > 0) {
              remaining.push(fieldset.fields[0]);
              preservedFieldsets += 1;
            }
            removed += fieldset.fields.length - remaining.length;
            fieldset.fields = remaining;
          });
          if (!removed) {
            setStatus("表示中の Field はありません。", "warning");
            return;
          }
          renderFieldsets();
          refreshCaseFieldAssignments({ rerenderCaseToggles: true });
          renderFigure();
          if (preservedFieldsets > 0) {
            setStatus(
              `${removed} 件の表示中 Field を削除しました (${preservedFieldsets} 件の Fieldset では 1 件を保持しました)。`,
              "warning"
            );
          } else {
            setStatus(`${removed} 件の表示中 Field を削除しました。`, "ok");
          }
        }

        function renderTriOrbShapeCheckboxes() {
          if (!triorbShapeCheckboxes) {
            return;
          }
          if (!triorbShapes.length) {
            triorbShapeCheckboxes.innerHTML = '<p class="toggle-pill-empty">No shapes available.</p>';
            return;
          }
          triorbShapeCheckboxes.innerHTML = triorbShapes
            .map((shape, index) => {
              const isVisible = shape.visible !== false;
              shape.visible = isVisible;
              return `
                <button
                  type="button"
                  class="toggle-pill-btn${isVisible ? " active" : ""}"
                  data-shape-index="${index}"
                  aria-pressed="${isVisible}"
                >
                  ${escapeHtml(shape.name || `Shape ${index + 1}`)}
                </button>`;
            })
            .join("");
        }

        function setTriOrbShapeVisibility(visible) {
          triorbShapes.forEach((shape) => {
            shape.visible = visible;
          });
          invalidateTriOrbShapeCaches();
          renderTriOrbShapeCheckboxes();
          renderFigure();
        }

        function deleteVisibleTriOrbShapes() {
          const visibleShapes = triorbShapes
            .map((shape, index) => ({ shape, index }))
            .filter(({ shape }) => shape && shape.visible !== false);
          if (!visibleShapes.length) {
            setStatus("表示中の Shape はありません。", "warning");
            return;
          }
          const shapeIdsToRemove = new Set(visibleShapes.map(({ shape }) => shape.id));
          triorbShapes = triorbShapes.filter((shape) => !shapeIdsToRemove.has(shape?.id));
          rebuildTriOrbShapeRegistry();
          invalidateTriOrbShapeCaches();
          fieldsets.forEach((fieldset) => {
            (fieldset.fields || []).forEach((field) => {
              if (Array.isArray(field.shapeRefs)) {
                field.shapeRefs = field.shapeRefs.filter((ref) => !shapeIdsToRemove.has(ref.shapeId));
              }
            });
          });
          renderTriOrbShapes();
          renderTriOrbShapeCheckboxes();
          renderFieldsets();
          renderFigure();
          setStatus(`${visibleShapes.length} 件の表示中 Shape を削除しました。`, "ok");
        }

        function removeTriOrbShape(shapeIndex) {
          if (!Number.isFinite(shapeIndex) || shapeIndex < 0 || shapeIndex >= triorbShapes.length) {
            return;
          }
          const removedShape = triorbShapes[shapeIndex];
          triorbShapes.splice(shapeIndex, 1);
          rebuildTriOrbShapeRegistry();
          fieldsets.forEach((fieldset) => {
            (fieldset.fields || []).forEach((field) => {
              if (Array.isArray(field.shapeRefs)) {
                field.shapeRefs = field.shapeRefs.filter(
                  (ref) => ref.shapeId !== removedShape.id
                );
              }
            });
          });
          renderTriOrbShapes();
          renderTriOrbShapeCheckboxes();
          renderFieldsets();
          renderFigure();
        }

        if (saveTriOrbBtn) {
          saveTriOrbBtn.addEventListener("click", () => {
            const xml = buildTriOrbXml();
            downloadXml(xml, `TriOrb_${Date.now()}.sgexml`);
            setStatus("TriOrb XML downloaded.");
          });
        }
        if (saveSickBtn) {
          saveSickBtn.addEventListener("click", () => {
            console.debug("Save (SICK) start", {
              fieldsetDeviceCount: fieldsetDevices.length,
              fieldsetDevices: fieldsetDevices
                .slice(0, 4)
                .map((device, index) => ({
                  index,
                  deviceName: device.attributes?.DeviceName,
                  typekey: device.attributes?.Typekey,
                })),
              scanPlaneCount: scanPlanes.length,
              fieldsetCount: fieldsets.length,
              triorbShapeCount: triorbShapes.length,
            });
            if (!fieldsetDevices.length) {
              console.warn("Save (SICK) without devices; using legacy export", {
                fieldsetCount: fieldsets.length,
                scanPlaneCount: scanPlanes.length,
              });
              const xml = buildLegacyXml();
              downloadXml(xml, `sick_${Date.now()}.sgexml`);
              setStatus("SICK XML downloaded (no devices).");
              return;
            }
            fieldsetDevices.forEach((device, index) => {
              console.debug("Save (SICK) preparing device export", {
                index,
                deviceName: device.attributes?.DeviceName,
                typekey: device.attributes?.Typekey,
                scanPlaneMatchByName: Boolean(
                  findScanPlaneDeviceByName(device.attributes?.DeviceName)
                ),
                scanPlaneMatchByTypekey: Boolean(
                  findScanPlaneDeviceByTypekey(device.attributes?.Typekey)
                ),
              });
              const scanDevice =
                findScanPlaneDeviceByName(device.attributes?.DeviceName) ||
                findScanPlaneDeviceByTypekey(device.attributes?.Typekey);
              const scanAttrs = {
                ...(scanDevice?.attributes || device.attributes || {}),
              };
              if (!scanAttrs.DeviceName && device.attributes?.DeviceName) {
                scanAttrs.DeviceName = device.attributes.DeviceName;
              }
              const xmlLines = buildBaseSdImportExportLines({
                scanDeviceAttrs: scanAttrs,
                fieldsetDeviceAttrs: device.attributes,
                includeUserFieldIds: false,
              });
              const xml = xmlLines.join("\n");
              const prefix = formatDeviceFilePrefix(device.attributes, index);
              downloadXml(xml, `${prefix}_${Date.now()}.sgexml`);
            });
            console.debug("Save (SICK) complete", {
              exportedDeviceCount: fieldsetDevices.length,
            });
            setStatus(`SICK XML downloaded for ${fieldsetDevices.length} device(s).`);
          });
        }
        if (newPlotBtn) {
          newPlotBtn.addEventListener("click", () => {
            fieldsets = [];
            triorbShapes = [];
            createShapePreview = null;
            createShapeDraftId = null;
            renderFieldsets();
            renderTriOrbShapes();
            renderTriOrbShapeCheckboxes();
            renderFieldsetCheckboxes();
            renderFieldsetDevices();
            renderFieldsetGlobal();
            fieldOfViewDegrees = parseNumeric(fieldOfViewInput?.value, 270);
            console.debug("New canvas state", {
              fieldsetDevices,
              fieldOfViewDegrees,
            });
            renderFigure();
            setStatus("New canvas ready.");
          });
        }
        let createShapeModalOffsetX = 0;
        let createShapeModalOffsetY = 0;
        let createShapeDragStartX = 0;
        let createShapeDragStartY = 0;
        let isCreateShapeDragging = false;
        let isCreateShapeResizing = false;
        let createShapeInitialWidth = 0;
        let createShapeInitialHeight = 0;
        let createShapeLastDx = 0;
        let createShapeLastDy = 0;
        let createFieldModalOffsetX = 0;
        let createFieldModalOffsetY = 0;
        let createFieldModalDragStartX = 0;
        let createFieldModalDragStartY = 0;
        let isCreateFieldModalDragging = false;
        let createFieldModalInitialWidth = 0;
        let createFieldModalInitialHeight = 0;
        let isCreateFieldModalResizing = false;
        let createFieldModalLastDx = 0;
        let createFieldModalLastDy = 0;
        let replicateModalOffsetX = 0;
        let replicateModalOffsetY = 0;
        let replicateModalDragStartX = 0;
        let replicateModalDragStartY = 0;
        let replicateModalInitialWidth = 0;
        let replicateModalInitialHeight = 0;
        let replicateModalLastDx = 0;
        let replicateModalLastDy = 0;
        let isReplicateModalDragging = false;
        let isReplicateModalResizing = false;
        let bulkEditModalOffsetX = 0;
        let bulkEditModalOffsetY = 0;
        let bulkEditModalDragStartX = 0;
        let bulkEditModalDragStartY = 0;
        let bulkEditModalInitialWidth = 0;
        let bulkEditModalInitialHeight = 0;
        let bulkEditModalLastDx = 0;
        let bulkEditModalLastDy = 0;
        let isBulkEditModalDragging = false;
        let isBulkEditModalResizing = false;
        function ensureCreateShapePosition() {
          if (createShapeModalWindow) {
            createShapeModalWindow.style.transform = `translate(${createShapeModalOffsetX}px, ${createShapeModalOffsetY}px)`;
          }
        }
        function resetCreateShapeForm() {
          createShapeDraftId = null;
          if (!createShapeNameInput) return;
          createShapeNameInput.value = "";
          if (createShapeFieldtypeSelect) {
            createShapeFieldtypeSelect.value = "ProtectiveSafeBlanking";
          }
          if (createShapeKindSelect) {
            createShapeKindSelect.value = "Field";
          }
          if (createShapeTypeSelect) {
            createShapeTypeSelect.value = "Polygon";
          }
          if (createShapePointsInput) {
            createShapePointsInput.value = "(0,0),(100,0),(100,100)";
          }
          const rectDefaults = {
            originx: 0,
            originy: 0,
            width: 100,
            height: 100,
            rotation: 0,
          };
          Object.entries(rectDefaults).forEach(([key, val]) => {
            const input = document.getElementById(`create-rect-${key}`);
            if (input) input.value = val;
          });
          const circleDefaults = {
            centerx: 0,
            centery: 0,
            radius: 100,
          };
          Object.entries(circleDefaults).forEach(([key, val]) => {
            const input = document.getElementById(`create-circle-${key}`);
            if (input) input.value = val;
          });
          updateCreateShapeDimensionVisibility();
          setCreateShapeFieldsetSelections([]);
        }

        function updateCreateShapeDimensionVisibility() {
          if (!createShapeTypeSelect) return;
          const type = createShapeTypeSelect.value;
          const isPolygon = type === "Polygon";
          const isRectangle = type === "Rectangle";
          const isCircle = type === "Circle";
          if (createShapePolygonGroup) {
            createShapePolygonGroup.classList.toggle("active", isPolygon);
          }
          if (createShapeRectFields) {
            createShapeRectFields.classList.toggle("active", isRectangle);
          }
          if (createShapeCircleFields) {
            createShapeCircleFields.classList.toggle("active", isCircle);
          }
        }

        function getCreateShapeSelectedFieldsets() {
          if (!createShapeFieldsetList) {
            return [];
          }
          return Array.from(
            createShapeFieldsetList.querySelectorAll(".toggle-pill-btn.active")
          )
            .map((button) => Number(button.dataset.createFieldsetIndex))
            .filter((index) => Number.isFinite(index) && index >= 0);
        }

        function readCreateShapeFormShape() {
          if (!createShapeDraftId) {
            createShapeDraftId = createShapeId();
          }
          const geometryType = createShapeTypeSelect?.value || "Polygon";
          const fieldtypeValue = createShapeFieldtypeSelect?.value || "ProtectiveSafeBlanking";
          const kindValue = createShapeKindSelect?.value || "Field";
          const rawName = (createShapeNameInput?.value || "").trim();
          const polygonPoints = parsePolygonPoints(createShapePointsInput?.value || "");
          const rectangle = {
            Type: kindValue,
            OriginX: String(createRectOriginXInput?.value ?? "0"),
            OriginY: String(createRectOriginYInput?.value ?? "0"),
            Width: String(createRectWidthInput?.value ?? "0"),
            Height: String(createRectHeightInput?.value ?? "0"),
            Rotation: String(createRectRotationInput?.value ?? "0"),
          };
          const circle = {
            Type: kindValue,
            CenterX: String(createCircleCenterXInput?.value ?? "0"),
            CenterY: String(createCircleCenterYInput?.value ?? "0"),
            Radius: String(createCircleRadiusInput?.value ?? "0"),
          };
          const polygon = {
            Type: kindValue,
            points: polygonPoints,
          };
          return {
            id: createShapeDraftId,
            name: rawName || `Shape ${triorbShapes.length + 1}`,
            type: geometryType,
            fieldtype: fieldtypeValue,
            kind: kindValue,
            polygon,
            rectangle,
            circle,
            visible: true,
          };
        }

        function validateCreateShapeDraft(shape, { strict = false } = {}) {
          if (!shape) {
            return { ok: false, message: "Shape definition is missing." };
          }
          if (shape.type === "Polygon") {
            const points = Array.isArray(shape.polygon?.points) ? shape.polygon.points : [];
            const minPoints = strict ? 3 : 2;
            if (points.length < minPoints) {
            return {
              ok: false,
              message: strict
                ? "Polygon には 3 点以上が必要です。"
                : "Polygon は 2 点以上必要です。",
            };
          }
        } else if (shape.type === "Rectangle") {
          const width = parseNumeric(shape.rectangle?.Width, NaN);
          const height = parseNumeric(shape.rectangle?.Height, NaN);
          if (!Number.isFinite(width) || !Number.isFinite(height)) {
              return {
                ok: false,
                message: "Rectangle の幅・高さを正しく入力してください。",
              };
           }
           if (width === 0 || height === 0) {
              return {
                ok: false,
                message: "Rectangle の幅と高さは 0 より大きくしてください。",
              };
           }
         } else if (shape.type === "Circle") {
           const radius = parseNumeric(shape.circle?.Radius, NaN);
           if (!Number.isFinite(radius) || radius <= 0) {
              return {
                ok: false,
                message: "Circle の半径は正の数でなければいけません。",
              };
           }
         }
          return { ok: true };
        }

        function updateCreateShapePreview() {
          const shape = readCreateShapeFormShape();
          const validation = validateCreateShapeDraft(shape, { strict: false });
          createShapePreview = validation.ok ? shape : null;
          renderFigure();
        }

        function clearCreateShapePreview() {
          if (createShapePreview) {
            createShapePreview = null;
            renderFigure();
          }
        }

        function handleCreateShapeFormInput(event) {
          if (!createShapeModal?.classList.contains("active")) {
            return;
          }
          if (!event || !(event.target instanceof HTMLElement)) {
            return;
          }
          updateCreateShapePreview();
        }

        function attachShapeToFieldsets(shapeId, fieldsetIndexes) {
          let attachedCount = 0;
          fieldsetIndexes.forEach((fieldsetIndex) => {
            const fieldset = fieldsets[fieldsetIndex];
            if (!fieldset || !Array.isArray(fieldset.fields)) {
              return;
            }
            fieldset.fields.forEach((field) => {
              field.shapeRefs = field.shapeRefs || [];
              if (!field.shapeRefs.some((ref) => ref.shapeId === shapeId)) {
                field.shapeRefs.push({ shapeId });
                const resolvedShape =
                  findTriOrbShapeById(shapeId) || triorbShapes.find((shape) => shape.id === shapeId);
                ensureInlineGeometryForShape(field, resolvedShape);
                attachedCount += 1;
              }
            });
          });
          return attachedCount;
        }

        function renderCreateShapeFieldsetsList() {
          if (!createShapeFieldsetList) return;
          if (!fieldsets.length) {
            createShapeFieldsetList.innerHTML = "<p>No fieldsets available.</p>";
            return;
          }
          createShapeFieldsetList.innerHTML = fieldsets
            .map((fieldset, index) => {
              const name = escapeHtml(fieldset.attributes?.Name || `Fieldset ${index + 1}`);
              return `
              <button
                type="button"
                class="toggle-pill-btn"
                data-create-fieldset-index="${index}"
                aria-pressed="false"
              >
                ${name}
              </button>`;
            })
            .join("");
        }

        function setCreateShapeFieldsetSelections(indexes = []) {
          if (!createShapeFieldsetList) {
            return;
          }
          const indexSet = new Set(indexes.map((value) => Number(value)));
          createShapeFieldsetList.querySelectorAll(".toggle-pill-btn").forEach((button) => {
            const index = Number(button.dataset.createFieldsetIndex);
            const isActive = indexSet.has(index);
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
          });
        }

        function getFieldsetIndexesReferencingShape(shapeId) {
          const indexes = [];
          fieldsets.forEach((fieldset, index) => {
            const hasReference = (fieldset.fields || []).some((field) =>
              Array.isArray(field.shapeRefs) &&
              field.shapeRefs.some((ref) => ref.shapeId === shapeId)
            );
            if (hasReference) {
              indexes.push(index);
            }
          });
          return indexes;
        }

        function populateCreateShapeForm(shape) {
          if (!shape) {
            return;
          }
          if (createShapeNameInput) {
            createShapeNameInput.value = shape.name || "";
          }
          if (createShapeFieldtypeSelect) {
            createShapeFieldtypeSelect.value = shape.fieldtype || "ProtectiveSafeBlanking";
          }
          if (createShapeKindSelect) {
            createShapeKindSelect.value = shape.kind || "Field";
          }
          if (createShapeTypeSelect) {
            createShapeTypeSelect.value = shape.type || "Polygon";
          }
          if (createShapePointsInput) {
            const pointText = formatPolygonPoints(shape.polygon?.points || []);
            createShapePointsInput.value = pointText || "(0,0),(100,0),(100,100)";
          }
          if (shape.rectangle) {
            Object.entries(shape.rectangle).forEach(([key, value]) => {
              const input = document.getElementById(`create-rect-${key.toLowerCase()}`);
              if (input) {
                input.value = value;
              }
            });
          } else {
            ["originx", "originy", "width", "height", "rotation"].forEach((field) => {
              const input = document.getElementById(`create-rect-${field}`);
              if (input) {
                input.value = field === "rotation" ? "0" : "0";
              }
            });
          }
          if (shape.circle) {
            Object.entries(shape.circle).forEach(([key, value]) => {
              const input = document.getElementById(`create-circle-${key.toLowerCase()}`);
              if (input) {
                input.value = value;
              }
            });
          }
        }

        function detachShapeFromAllFieldsets(shapeId) {
          fieldsets.forEach((fieldset) => {
            (fieldset.fields || []).forEach((field) => {
              if (Array.isArray(field.shapeRefs)) {
                field.shapeRefs = field.shapeRefs.filter((ref) => ref.shapeId !== shapeId);
              }
            });
          });
        }

        function openCreateShapeModalForCreate() {

          createShapeMode = "create";

          createShapeEditingId = null;

          createShapeOriginal = null;

          resetCreateShapeForm();

          renderCreateShapeFieldsetsList();

          setCreateShapeFieldsetSelections([]);

          createShapeDraftId = createShapeId();

          if (createShapeModalTitle) {

            createShapeModalTitle.textContent = "Add Shape";

          }

          if (createShapeModalSave) {

            createShapeModalSave.textContent = "Add Shape";

          }

          if (createShapeModalDelete) {

            createShapeModalDelete.hidden = true;

          }

          updateCreateShapeDimensionVisibility();

          updateCreateShapePreview();

          createShapeModalOffsetX = 0;

          createShapeModalOffsetY = 0;

          ensureCreateShapePosition();
          if (createShapeModal) {
            createShapeModal.dataset.mode = "create";
          }
          createShapeModal?.classList.add("active");
          createShapeModal?.setAttribute("aria-hidden", "false");
        }



                function openCreateShapeModalForEdit(shapeId) {
          const shapeIndex = triorbShapes.findIndex((shape) => shape.id === shapeId);
          if (shapeIndex < 0) {
            return;
          }
          const shape = triorbShapes[shapeIndex];
          createShapeMode = "edit";
          createShapeEditingId = shape.id;
          createShapeOriginal = cloneShape(shape);
          renderCreateShapeFieldsetsList();
          populateCreateShapeForm(shape);
          const referencing = getFieldsetIndexesReferencingShape(shape.id);
          setCreateShapeFieldsetSelections(referencing);
          createShapeDraftId = shape.id;
          if (createShapeModalTitle) {
            createShapeModalTitle.textContent = "Edit Shape";
          }
          if (createShapeModalSave) {
            createShapeModalSave.textContent = "Edit Shape";
          }
          if (createShapeModalDelete) {
            createShapeModalDelete.hidden = false;
          }
          updateCreateShapeDimensionVisibility();
          updateCreateShapePreview();
          createShapeModalOffsetX = 0;
          createShapeModalOffsetY = 0;
          ensureCreateShapePosition();
          if (createShapeModal) {
            createShapeModal.dataset.mode = "edit";
          }
          createShapeModal?.classList.add("active");
          createShapeModal?.setAttribute("aria-hidden", "false");
        }

        function closeCreateShapeModal() {
          clearCreateShapePreview();
          createShapeDraftId = null;
          createShapeMode = "create";
          createShapeEditingId = null;
          createShapeOriginal = null;
          if (createShapeModalTitle) {
            createShapeModalTitle.textContent = "Add Shape";
          }
          if (createShapeModalSave) {
            createShapeModalSave.textContent = "Add Shape";
          }
          if (createShapeModalDelete) {
            createShapeModalDelete.hidden = true;
          }
          if (createShapeModal) {
            createShapeModal.dataset.mode = "create";
          }
          createShapeModal?.classList.remove("active");
          createShapeModal?.setAttribute("aria-hidden", "true");
        }

        if (overlayShapeBtn) {
          overlayShapeBtn.addEventListener("click", openCreateShapeModalForCreate);
        }
        if (overlayFieldBtn) {
          overlayFieldBtn.addEventListener("click", () => {
            openCreateFieldModalForCreate();
          });
        }
        if (replicateFieldBtn) {
          replicateFieldBtn.addEventListener("click", openReplicateModal);
        }
        if (bulkEditBtn) {
          bulkEditBtn.addEventListener("click", openBulkEditModal);
        }
        if (createShapeTypeSelect) {
          createShapeTypeSelect.addEventListener("change", () => {
            updateCreateShapeDimensionVisibility();
            updateCreateShapePreview();
          });
          updateCreateShapeDimensionVisibility();
        }
        if (createShapeModalClose) {
          createShapeModalClose.addEventListener("click", closeCreateShapeModal);
        }
        if (createShapeModalCancel) {
          createShapeModalCancel.addEventListener("click", closeCreateShapeModal);
        }
        if (createShapeModalSave) {
          createShapeModalSave.addEventListener("click", () => {
            const draft = readCreateShapeFormShape();
            const validation = validateCreateShapeDraft(draft, { strict: true });
            if (!validation.ok) {
              setStatus(validation.message, "error");
              return;
            }
            applyShapeKind(draft, draft.kind);
            if (createShapeMode === "edit" && createShapeEditingId) {
              const shapeIndex = triorbShapes.findIndex((shape) => shape.id === createShapeEditingId);
              if (shapeIndex < 0) {
                setStatus("Selected shape was not found.", "error");
                return;
              }
              const updatedShape = JSON.parse(JSON.stringify(draft));
              updatedShape.visible = triorbShapes[shapeIndex].visible !== false;
              triorbShapes[shapeIndex] = updatedShape;
              registerTriOrbShapeLookup(updatedShape, shapeIndex);
              invalidateTriOrbShapeCaches();
              const selectedFieldsets = getCreateShapeSelectedFieldsets();
              detachShapeFromAllFieldsets(updatedShape.id);
              const attached = attachShapeToFieldsets(updatedShape.id, selectedFieldsets);
              renderTriOrbShapes();
              renderTriOrbShapeCheckboxes();
              renderFieldsets();
              renderFigure();
              setStatus(`${updatedShape.name} を更新しました（${attached} 件の Fieldset に適用）`, "ok");
            } else {
              const createdShape = JSON.parse(JSON.stringify(draft));
              triorbShapes.push(createdShape);
              registerTriOrbShapeInRegistry(createdShape, triorbShapes.length - 1);
              invalidateTriOrbShapeCaches();
              const selectedFieldsets = getCreateShapeSelectedFieldsets();
              const attached = attachShapeToFieldsets(createdShape.id, selectedFieldsets);
              renderTriOrbShapes();
              renderTriOrbShapeCheckboxes();
              renderFieldsets();
              renderFigure();
              setStatus(`${draft.name} を追加しました（${attached} 件の Fieldset に適用）`, "ok");
            }
            closeCreateShapeModal();
          });
        }
        if (createShapeModal) {
          createShapeModal.addEventListener("input", handleCreateShapeFormInput);
          createShapeModal.addEventListener("change", handleCreateShapeFormInput);
          createShapeModal.addEventListener("click", (event) => {
            if (event.target?.dataset?.action === "close-create-shape") {
              closeCreateShapeModal();
            }
          });
        }
        if (createShapeFieldsetList) {
          createShapeFieldsetList.addEventListener("click", (event) => {
            const button = event.target.closest(".toggle-pill-btn");
            if (!button) {
              return;
            }
            event.preventDefault();
            const isActive = button.classList.toggle("active");
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
          });
        }
        if (createFieldModal) {
          createFieldModal.addEventListener("click", (event) => {
            if (event.target?.dataset?.action === "close-create-field") {
              closeCreateFieldModal();
            }
          });
        }
        if (replicateModal) {
          replicateModal.addEventListener("click", (event) => {
            if (event.target?.dataset?.action === "close-replicate-modal") {
              closeReplicateModal();
            }
          });
        }
        if (createFieldModalClose) {
          createFieldModalClose.addEventListener("click", closeCreateFieldModal);
        }
        if (createFieldModalCancel) {
          createFieldModalCancel.addEventListener("click", closeCreateFieldModal);
        }
        if (createFieldModalSave) {
          createFieldModalSave.addEventListener("click", () => {
            if (persistCreateFieldModal()) {
              closeCreateFieldModal();
            }
          });
        }
        if (replicateModalClose) {
          replicateModalClose.addEventListener("click", closeReplicateModal);
        }
        if (replicateModalCancel) {
          replicateModalCancel.addEventListener("click", closeReplicateModal);
        }
        if (replicateModalApply) {
          replicateModalApply.addEventListener("click", handleReplicateApply);
        }
        if (bulkEditModal) {
          bulkEditModal.addEventListener("click", (event) => {
            if (event.target?.dataset?.action === "close-bulk-edit") {
              closeBulkEditModal();
            }
          });
        }
        if (bulkEditModalClose) {
          bulkEditModalClose.addEventListener("click", closeBulkEditModal);
        }
        if (bulkEditModalCancel) {
          bulkEditModalCancel.addEventListener("click", closeBulkEditModal);
        }
        if (bulkEditModalApply) {
          bulkEditModalApply.addEventListener("click", applyBulkEditChanges);
        }
        if (bulkEditCaseToggles) {
          bulkEditCaseToggles.addEventListener("click", handleBulkToggleClick);
        }
        if (bulkEditShapeToggles) {
          bulkEditShapeToggles.addEventListener("click", handleBulkToggleClick);
        }
          [bulkShapeOutsetInput, bulkShapeMoveXInput, bulkShapeMoveYInput].forEach((input) => {
            if (input) {
              input.addEventListener("input", () => {
                renderFigure();
              });
          }
        });
        createFieldShapeLists.forEach((listObj) => {
          Object.values(listObj).forEach((list) => {
            if (list) {
              list.addEventListener("click", handleCreateFieldShapeToggle);
            }
          });
        });
        createFieldNameInputs.forEach((input) => {
          if (input) {
            input.addEventListener("input", updateFieldModalPreview);
          }
        });
        createFieldTypeSelects.forEach((select) => {
          if (select) {
            select.addEventListener("change", updateFieldModalPreview);
          }
        });
        if (replicateFieldsetSelect) {
          replicateFieldsetSelect.addEventListener("change", (event) => {
            const nextIndex = Number(event.target.value);
            const safeFieldsetIndex = Number.isFinite(nextIndex)
              ? Math.max(0, nextIndex)
              : 0;
            replicateFormState.fieldsetIndex = safeFieldsetIndex;
            updateReplicatePrefixPlaceholder();
            updateReplicatePreview();
          });
        }
        if (replicateCaseSelect) {
          replicateCaseSelect.addEventListener("change", () => {
            replicateFormState.selectedCaseIndexes = captureSelectedReplicateCases();
            updateReplicatePrefixPlaceholder();
            updateReplicatePreview();
          });
        }
        [
          replicateCopyCountInput,
          replicateOffsetXInput,
          replicateOffsetYInput,
          replicateRotationInput,
          replicateRotationOriginXInput,
          replicateRotationOriginYInput,
          replicateEllipseRatioInput,
          replicateWidthSineGainInput,
          replicateHeightSineGainInput,
          replicateScalePercentInput,
          replicateSpeedMinStepInput,
          replicateSpeedMaxStepInput,
        ].forEach((input) => {
          if (input) {
            input.addEventListener("input", () => {
              updateReplicatePreview();
            });
          }
        });
        [replicateWidthSineGainInput, replicateHeightSineGainInput].forEach((input) => {
          if (input) {
            input.addEventListener("change", updateReplicatePreview);
          }
        });
        if (replicateTargetToggle) {
          replicateTargetToggle.addEventListener("click", (event) => {
            const button = event.target.closest("[data-replicate-target]");
            if (!button) {
              return;
            }
            event.preventDefault();
            const nextTarget = button.dataset.replicateTarget === "case" ? "case" : "fieldset";
            if (nextTarget === "case" && !hasCaseReplicationTarget()) {
              setStatus("複製できる Case がありません。", "warning");
              return;
            }
            if (nextTarget === "fieldset" && !hasFieldsetReplicationTarget()) {
              setStatus("複製できる Fieldset がありません。", "warning");
              return;
            }
            setReplicateTarget(nextTarget);
          });
        }
        if (replicateIncludeCutoutsInput) {
          replicateIncludeCutoutsInput.addEventListener("change", updateReplicatePreview);
        }
        if (replicatePreserveOrientationInput) {
          replicatePreserveOrientationInput.addEventListener("change", () => {
            updateReplicateSineGainAvailability({ syncPreview: true });
          });
        }
        if (replicateStaticInputsAutoInput) {
          replicateStaticInputsAutoInput.addEventListener("change", updateReplicatePreview);
        }
        if (replicateIncludePreviousFieldsInput) {
          replicateIncludePreviousFieldsInput.addEventListener("change", updateReplicatePreview);
        }
        function startCreateShapeDrag(event) {
          if (!createShapeModalWindow) return;
          isCreateShapeDragging = true;
          createShapeDragStartX = event.clientX;
          createShapeDragStartY = event.clientY;
          createShapeModalWindow.style.transition = "none";
        }
        function updateCreateShapeDrag(event) {
          if (!isCreateShapeDragging) return;
          const dx = event.clientX - createShapeDragStartX;
          const dy = event.clientY - createShapeDragStartY;
          if (createShapeModalWindow) {
            createShapeModalWindow.style.transform = `translate(${createShapeModalOffsetX + dx}px, ${createShapeModalOffsetY + dy}px)`;
          }
          createShapeLastDx = dx;
          createShapeLastDy = dy;
        }
        function endCreateShapeDrag() {
          if (!isCreateShapeDragging) return;
          createShapeModalOffsetX += createShapeLastDx;
          createShapeModalOffsetY += createShapeLastDy;
          isCreateShapeDragging = false;
          if (createShapeModalWindow) {
            createShapeModalWindow.style.transition = "";
            ensureCreateShapePosition();
          }
        }
        function startCreateShapeResize(event) {
          if (!createShapeModalWindow) return;
          isCreateShapeResizing = true;
          createShapeResizeStartX = event.clientX;
          createShapeResizeStartY = event.clientY;
          createShapeInitialWidth = createShapeModalWindow.offsetWidth;
          createShapeInitialHeight = createShapeModalWindow.offsetHeight;
          createShapeModalWindow.style.transition = "none";
        }
        function updateCreateShapeResize(event) {
          if (!isCreateShapeResizing || !createShapeModalWindow) return;
          const dx = event.clientX - createShapeResizeStartX;
          const dy = event.clientY - createShapeResizeStartY;
          const width = Math.max(360, createShapeInitialWidth + dx);
          const height = Math.max(360, createShapeInitialHeight + dy);
          createShapeModalWindow.style.width = `${width}px`;
          createShapeModalWindow.style.height = `${height}px`;
        }
        function endCreateShapeResize() {
          isCreateShapeResizing = false;
          if (createShapeModalWindow) {
            createShapeModalWindow.style.transition = "";
          }
        }
        function ensureCreateFieldModalPosition() {
          if (!createFieldModalWindow) {
            return;
          }
          createFieldModalWindow.style.transform = `translate(${createFieldModalOffsetX}px, ${createFieldModalOffsetY}px)`;
        }
        function startCreateFieldModalDrag(event) {
          if (!createFieldModalWindow) {
            return;
          }
          isCreateFieldModalDragging = true;
          createFieldModalDragStartX = event.clientX;
          createFieldModalDragStartY = event.clientY;
          createFieldModalWindow.style.transition = "none";
        }
        function updateCreateFieldModalDrag(event) {
          if (!isCreateFieldModalDragging || !createFieldModalWindow) {
            return;
          }
          const dx = event.clientX - createFieldModalDragStartX;
          const dy = event.clientY - createFieldModalDragStartY;
          createFieldModalWindow.style.transform = `translate(${createFieldModalOffsetX + dx}px, ${createFieldModalOffsetY + dy}px)`;
          createFieldModalLastDx = dx;
          createFieldModalLastDy = dy;
        }
        function endCreateFieldModalDrag() {
          if (!isCreateFieldModalDragging) {
            return;
          }
          createFieldModalOffsetX += createFieldModalLastDx;
          createFieldModalOffsetY += createFieldModalLastDy;
          isCreateFieldModalDragging = false;
          if (createFieldModalWindow) {
            createFieldModalWindow.style.transition = "";
            ensureCreateFieldModalPosition();
          }
        }
        function startCreateFieldModalResize(event) {
          if (!createFieldModalWindow) {
            return;
          }
          isCreateFieldModalResizing = true;
          createFieldModalDragStartX = event.clientX;
          createFieldModalDragStartY = event.clientY;
          createFieldModalInitialWidth = createFieldModalWindow.offsetWidth;
          createFieldModalInitialHeight = createFieldModalWindow.offsetHeight;
          createFieldModalWindow.style.transition = "none";
        }
        function updateCreateFieldModalResize(event) {
          if (!isCreateFieldModalResizing || !createFieldModalWindow) {
            return;
          }
          const dx = event.clientX - createFieldModalDragStartX;
          const dy = event.clientY - createFieldModalDragStartY;
          const width = Math.max(320, createFieldModalInitialWidth + dx);
          const height = Math.max(320, createFieldModalInitialHeight + dy);
          createFieldModalWindow.style.width = `${width}px`;
          createFieldModalWindow.style.height = `${height}px`;
        }
        function endCreateFieldModalResize() {
          isCreateFieldModalResizing = false;
          if (createFieldModalWindow) {
            createFieldModalWindow.style.transition = "";
          }
        }

        function startReplicateModalDrag(event) {
          if (!replicateModalWindow) {
            return;
          }
          isReplicateModalDragging = true;
          replicateModalDragStartX = event.clientX;
          replicateModalDragStartY = event.clientY;
          replicateModalWindow.style.transition = "none";
        }

        function updateReplicateModalDrag(event) {
          if (!isReplicateModalDragging || !replicateModalWindow) {
            return;
          }
          const dx = event.clientX - replicateModalDragStartX;
          const dy = event.clientY - replicateModalDragStartY;
          replicateModalWindow.style.transform = `translate(${replicateModalOffsetX + dx}px, ${replicateModalOffsetY + dy}px)`;
          replicateModalLastDx = dx;
          replicateModalLastDy = dy;
        }

        function endReplicateModalDrag() {
          if (!isReplicateModalDragging) {
            return;
          }
          replicateModalOffsetX += replicateModalLastDx;
          replicateModalOffsetY += replicateModalLastDy;
          isReplicateModalDragging = false;
          if (replicateModalWindow) {
            replicateModalWindow.style.transition = "";
          }
        }

        function startReplicateModalResize(event) {
          if (!replicateModalWindow) {
            return;
          }
          isReplicateModalResizing = true;
          replicateModalDragStartX = event.clientX;
          replicateModalDragStartY = event.clientY;
          replicateModalInitialWidth = replicateModalWindow.offsetWidth;
          replicateModalInitialHeight = replicateModalWindow.offsetHeight;
          replicateModalWindow.style.transition = "none";
        }

        function updateReplicateModalResize(event) {
          if (!isReplicateModalResizing || !replicateModalWindow) {
            return;
          }
          const dx = event.clientX - replicateModalDragStartX;
          const dy = event.clientY - replicateModalDragStartY;
          const width = Math.max(320, replicateModalInitialWidth + dx);
          const height = Math.max(320, replicateModalInitialHeight + dy);
          replicateModalWindow.style.width = `${width}px`;
          replicateModalWindow.style.height = `${height}px`;
        }

        function endReplicateModalResize() {
          isReplicateModalResizing = false;
          if (replicateModalWindow) {
            replicateModalWindow.style.transition = "";
          }
        }

        function startBulkEditModalDrag(event) {
          if (!bulkEditModalWindow) {
            return;
          }
          isBulkEditModalDragging = true;
          bulkEditModalDragStartX = event.clientX;
          bulkEditModalDragStartY = event.clientY;
          bulkEditModalWindow.style.transition = "none";
        }

        function updateBulkEditModalDrag(event) {
          if (!isBulkEditModalDragging || !bulkEditModalWindow) {
            return;
          }
          const dx = event.clientX - bulkEditModalDragStartX;
          const dy = event.clientY - bulkEditModalDragStartY;
          bulkEditModalWindow.style.transform = `translate(${bulkEditModalOffsetX + dx}px, ${bulkEditModalOffsetY + dy}px)`;
          bulkEditModalLastDx = dx;
          bulkEditModalLastDy = dy;
        }

        function endBulkEditModalDrag() {
          if (!isBulkEditModalDragging) {
            return;
          }
          bulkEditModalOffsetX += bulkEditModalLastDx;
          bulkEditModalOffsetY += bulkEditModalLastDy;
          isBulkEditModalDragging = false;
          if (bulkEditModalWindow) {
            bulkEditModalWindow.style.transition = "";
          }
        }

        function startBulkEditModalResize(event) {
          if (!bulkEditModalWindow) {
            return;
          }
          isBulkEditModalResizing = true;
          bulkEditModalDragStartX = event.clientX;
          bulkEditModalDragStartY = event.clientY;
          bulkEditModalInitialWidth = bulkEditModalWindow.offsetWidth;
          bulkEditModalInitialHeight = bulkEditModalWindow.offsetHeight;
          bulkEditModalWindow.style.transition = "none";
        }

        function updateBulkEditModalResize(event) {
          if (!isBulkEditModalResizing || !bulkEditModalWindow) {
            return;
          }
          const dx = event.clientX - bulkEditModalDragStartX;
          const dy = event.clientY - bulkEditModalDragStartY;
          const width = Math.max(360, bulkEditModalInitialWidth + dx);
          const height = Math.max(320, bulkEditModalInitialHeight + dy);
          bulkEditModalWindow.style.width = `${width}px`;
          bulkEditModalWindow.style.height = `${height}px`;
        }

        function endBulkEditModalResize() {
          isBulkEditModalResizing = false;
          if (bulkEditModalWindow) {
            bulkEditModalWindow.style.transition = "";
          }
        }
        if (createShapeModalHeader) {
          createShapeModalHeader.addEventListener("pointerdown", startCreateShapeDrag);
        }
        const resizeHandle = document.createElement("div");
        resizeHandle.className = "modal-resize-handle";
        if (createShapeModalWindow) {
          createShapeModalWindow.appendChild(resizeHandle);
        }
        resizeHandle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          startCreateShapeResize(event);
        });
        if (createFieldModalHeader) {
          createFieldModalHeader.addEventListener("pointerdown", startCreateFieldModalDrag);
        }
        const fieldResizeHandle = document.createElement("div");
        fieldResizeHandle.className = "modal-resize-handle field-resize-handle";
        if (createFieldModalBody) {
          createFieldModalBody.appendChild(fieldResizeHandle);
        } else if (createFieldModalWindow) {
          createFieldModalWindow.appendChild(fieldResizeHandle);
        }
        fieldResizeHandle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          startCreateFieldModalResize(event);
        });
        if (replicateModalHeader) {
          replicateModalHeader.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            startReplicateModalDrag(event);
          });
        }
        if (replicateModalBody || replicateModalWindow) {
          const replicateResizeHandle = document.createElement("div");
          replicateResizeHandle.className = "modal-resize-handle field-resize-handle";
          (replicateModalBody || replicateModalWindow)?.appendChild(replicateResizeHandle);
          replicateResizeHandle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            startReplicateModalResize(event);
          });
        }
        if (bulkEditModalHeader) {
          bulkEditModalHeader.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            startBulkEditModalDrag(event);
          });
        }
        if (bulkEditModalWindow) {
          const bulkEditResizeHandle = document.createElement("div");
          bulkEditResizeHandle.className = "modal-resize-handle";
          bulkEditModalWindow.appendChild(bulkEditResizeHandle);
          bulkEditResizeHandle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            startBulkEditModalResize(event);
          });
        }
        document.addEventListener("pointermove", (event) => {
          updateCreateShapeDrag(event);
          updateCreateShapeResize(event);
          updateCreateFieldModalDrag(event);
          updateCreateFieldModalResize(event);
          updateReplicateModalDrag(event);
          updateReplicateModalResize(event);
          updateBulkEditModalDrag(event);
          updateBulkEditModalResize(event);
        });
        document.addEventListener("pointerup", () => {
          endCreateShapeDrag();
          endCreateShapeResize();
          endCreateFieldModalDrag();
          endCreateFieldModalResize();
          endReplicateModalDrag();
          endReplicateModalResize();
          endBulkEditModalDrag();
          endBulkEditModalResize();
        });

        if (toggleLegendBtn) {
          toggleLegendBtn.addEventListener("click", () => {
            legendVisible = !legendVisible;
            toggleLegendBtn.textContent = legendVisible ? "Hide Legend" : "Show Legend";
            setStatus(legendVisible ? "Legend visible." : "Legend hidden.", legendVisible ? "ok" : "warning");
            renderFigure();
          });
        }

        fileInput.addEventListener("change", (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            try {
              const { traces, warning, triOrbPresent } = parseXmlToFigure(reader.result);
              const layout = cloneFigure(defaultFigure).layout;
              currentFigure = { data: traces, layout };
              invalidateBaseFigureTraces();
              renderFigure();
              if (warning) {
                setStatus(`${file.name} loaded with warnings: ${warning}`, "warning");
              } else {
                setStatus(
                  `${file.name} loaded${triOrbPresent ? " (TriOrb)" : ""}.`
                );
              }
            } catch (error) {
              console.error(error);
              setStatus(error.message || "Failed to load file.", "error");
            } finally {
              fileInput.value = "";
            }
          };
          reader.readAsText(file, "utf-8");
        });

        if (svgFileInput) {
          svgFileInput.addEventListener("change", (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const { shapes, warnings } = parseSvgToShapes(reader.result || "");
                handleSvgImportResult(file.name, shapes, warnings);
              } catch (error) {
                console.error(error);
                setStatus(error.message || "SVG の読み込みに失敗しました。", "error");
              } finally {
                svgFileInput.value = "";
              }
            };
            reader.readAsText(file, "utf-8");
          });
        }

        if (svgImportApplyBtn) {
          svgImportApplyBtn.addEventListener("click", applyPendingSvgImport);
        }
        if (svgImportCancelBtn) {
          svgImportCancelBtn.addEventListener("click", () => {
            closeSvgImportModal();
            setStatus("SVG インポートをキャンセルしました。", "warning");
          });
        }
        if (svgImportCloseBtn) {
          svgImportCloseBtn.addEventListener("click", closeSvgImportModal);
        }
        if (svgImportModal) {
          svgImportModal.addEventListener("click", (event) => {
            if (event.target?.dataset?.action === "close-svg-import") {
              closeSvgImportModal();
            }
          });
        }

        window.addEventListener("resize", () => {
          syncPlotSize();
          Plotly.Plots.resize(plotNode);
        });

        plotNode.on("plotly_hover", (event) => {
          if (event?.points?.length) {
            lastHoverPoint = event.points[0];
          }
        });

        plotNode.on("plotly_click", (event) => {
          const point = event?.points?.[0] || lastHoverPoint;
          console.debug("plotly_click", { point, lastHoverPoint });
          const meta = point?.meta || point?.data?.meta;
          if (meta?.kind) {
            console.debug("trigger modal", meta);
            if (meta.isTriOrbShape && meta.shapeId) {
              openCreateShapeModalForEdit(meta.shapeId);
            } else {
              renderShapeModal(meta);
            }
          }
        });
        if (shapeModal) {
          shapeModal.addEventListener("click", (event) => {
            if (event.target?.dataset?.action === "close-modal") {
              cancelShapeModal();
            }
          });
        }
        if (shapeModalBody) {
          shapeModalBody.addEventListener("input", handleShapeModalInput);
        }
        if (shapeModalCancel) {
          shapeModalCancel.addEventListener("click", cancelShapeModal);
        }
        if (shapeModalClose) {
          shapeModalClose.addEventListener("click", cancelShapeModal);
        }
        if (shapeModalSave) {
          shapeModalSave.addEventListener("click", saveShapeModal);
        }
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            if (createFieldModal?.classList.contains("active")) {
              closeCreateFieldModal();
            } else if (createShapeModal?.classList.contains("active")) {
              closeCreateShapeModal();
            } else {
              cancelShapeModal();
            }
          }
        });
        if (shapeModalHeader) {
          shapeModalHeader.addEventListener("pointerdown", startModalDrag);
        }
        document.addEventListener("pointermove", updateModalDrag);
        document.addEventListener("pointerup", endModalDrag);

        setupLayoutObservers();
        renderFigure();

        window.__triorbTestApi = {
          buildTriOrbXml: () => buildTriOrbXml(),
        };

        function setupLayoutObservers() {
          if (typeof ResizeObserver === "undefined") {
            return;
          }
          const observer = new ResizeObserver(() => {
            syncPlotSize();
            Plotly.Plots.resize(plotNode);
          });
          const contentArea = document.querySelector(".content-area");
          const sideMenu = document.querySelector(".side-menu");
          if (contentArea) observer.observe(contentArea);
          if (sideMenu) observer.observe(sideMenu);
        }
      });
