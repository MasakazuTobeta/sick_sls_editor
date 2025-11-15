export function parseNumeric(value, fallback = NaN) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

export function degreesToRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

export function normalizeDegrees(value) {
  const deg = Number(value);
  if (!Number.isFinite(deg)) {
    return 0;
  }
  const normalized = deg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function rotatePoint(x, y, radians, originX, originY) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: originX + x * cos - y * sin,
    y: originY + x * sin + y * cos,
  };
}

export function rotateAroundCorner(point, radians, origin) {
  const translatedX = point.x - origin.x;
  const translatedY = point.y - origin.y;
  const rotated = rotatePoint(translatedX, translatedY, radians, 0, 0);
  return {
    x: rotated.x + origin.x,
    y: rotated.y + origin.y,
  };
}

export function getRectangleCornerPoints(rectangle) {
  if (!rectangle) {
    return null;
  }
  const width = parseNumeric(rectangle.Width, NaN);
  const height = parseNumeric(rectangle.Height, NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) {
    return null;
  }
  const originX = parseNumeric(rectangle.OriginX, 0);
  const originY = parseNumeric(rectangle.OriginY, 0);
  const rotationDeg = parseNumeric(rectangle.Rotation, 0);
  const rotation = degreesToRadians(rotationDeg);
  const topLeft = { x: originX, y: originY };
  const topRight = { x: originX + width, y: originY };
  const bottomRight = { x: originX + width, y: originY - height };
  const bottomLeft = { x: originX, y: originY - height };
  const corners = [topLeft, topRight, bottomRight, bottomLeft];
  if (rotation === 0) {
    return corners;
  }
  return corners.map((corner) => rotateAroundCorner(corner, rotation, topLeft));
}
