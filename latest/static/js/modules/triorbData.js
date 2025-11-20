export function createShapeId() {
  return `shape-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultPolygonDetails() {
  return {
    Type: "CutOut",
    points: [
      { X: "0", Y: "0" },
      { X: "100", Y: "0" },
      { X: "100", Y: "100" },
      { X: "0", Y: "100" },
    ],
  };
}

export function createDefaultRectangleDetails() {
  return {
    Type: "Field",
    OriginX: "0",
    OriginY: "0",
    Width: "100",
    Height: "100",
    Rotation: "0",
  };
}

export function createDefaultCircleDetails() {
  return {
    Type: "Field",
    CenterX: "0",
    CenterY: "0",
    Radius: "100",
  };
}

export function formatPolygonPoints(points) {
  return (points || [])
    .map((point) => `(${point.X},${point.Y})`)
    .join(",");
}

export function parsePolygonPoints(value) {
  const sanitized = (value || "").trim();
  if (!sanitized) {
    return [];
  }
  return sanitized
    .split("),")
    .map((segment) => segment.replace(/[()]/g, "").trim())
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",").map((v) => v.trim());
      return { X: x || "0", Y: y || "0" };
    });
}

export function getPolygonTypeValue(polygon) {
  if (!polygon) {
    return undefined;
  }
  if (polygon.attributes && typeof polygon.attributes.Type !== "undefined") {
    return polygon.attributes.Type;
  }
  return polygon.Type;
}

export function setPolygonTypeValue(polygon, value) {
  if (!polygon || typeof value === "undefined") {
    return;
  }
  if (polygon.attributes) {
    polygon.attributes.Type = value;
  } else {
    polygon.Type = value;
  }
}

export function applyShapeKind(shape, kind) {
  if (!shape) {
    return;
  }
  const normalized = kind || "Field";
  shape.kind = normalized;
  setPolygonTypeValue(shape.polygon, normalized);
  if (shape.rectangle) {
    shape.rectangle.Type = normalized;
  }
  if (shape.circle) {
    shape.circle.Type = normalized;
  }
}

export function buildShapeKey(shapeType, attrs = {}, points = []) {
  const attrEntries = Object.keys(attrs || {})
    .sort()
    .map((key) => `${key}=${attrs[key] ?? ""}`)
    .join("|");
  let key = `${shapeType}|${attrEntries}`;
  if (shapeType === "Polygon") {
    const pointEntries = (points || [])
      .map((point) => `${String(point.X ?? point.x ?? "")}:${String(point.Y ?? point.y ?? "")}`)
      .join(";");
    key += `|${pointEntries}`;
  }
  return key;
}

export function createDefaultTriOrbShape(index, geometryType = "Polygon") {
  const polygon = createDefaultPolygonDetails();
  const rectangle = createDefaultRectangleDetails();
  const circle = createDefaultCircleDetails();
  const shape = {
    id: createShapeId(),
    name: `Shape ${index + 1}`,
    type: geometryType,
    fieldtype: "ProtectiveSafeBlanking",
    kind: "Field",
    polygon,
    rectangle,
    circle,
    visible: true,
  };
  applyShapeKind(shape, shape.kind);
  return shape;
}

export function initializeTriOrbShapes(data) {
  if (!Array.isArray(data) || !data.length) {
    return [createDefaultTriOrbShape(0)];
  }
  return data.map((shape, index) => {
    const fieldtype = shape.fieldtype || "ProtectiveSafeBlanking";
    const inferredKind =
      shape.kind ||
      shape.Kind ||
      getPolygonTypeValue(shape.polygon) ||
      (shape.rectangle && shape.rectangle.Type) ||
      (shape.circle && shape.circle.Type) ||
      "Field";
    const polygon = shape.polygon
      ? JSON.parse(JSON.stringify(shape.polygon))
      : createDefaultPolygonDetails();
    if (!getPolygonTypeValue(polygon)) {
      setPolygonTypeValue(polygon, inferredKind);
    }
    const rectangle = shape.rectangle
      ? JSON.parse(JSON.stringify(shape.rectangle))
      : createDefaultRectangleDetails();
    rectangle.Type = rectangle.Type || inferredKind;
    const circle = shape.circle
      ? JSON.parse(JSON.stringify(shape.circle))
      : createDefaultCircleDetails();
    circle.Type = circle.Type || inferredKind;
    const normalizedShape = {
      id: shape.id || createShapeId(),
      name: shape.name || `Shape ${index + 1}`,
      type: shape.type || "Polygon",
      fieldtype,
      kind: inferredKind,
      polygon,
      rectangle,
      circle,
      visible: shape.visible !== false,
    };
    applyShapeKind(normalizedShape, inferredKind);
    return normalizedShape;
  });
}
