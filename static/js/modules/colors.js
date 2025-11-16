export const colorProfiles = {
  FieldProtective: {
    hueCenter: 350,
    hueSpread: 20,
    saturation: 75,
    value: 100,
    lineAlpha: 0.5,
    fillAlpha: 0.125,
  },
  FieldWarning: {
    hueCenter: 60,
    hueSpread: 10,
    saturation: 80,
    value: 100,
    lineAlpha: 0.5,
    fillAlpha: 0.125,
  },
  TriOrbShape: {
    hueCenter: 120,
    hueSpread: 30,
    saturation: 60,
    value: 30,
    lineAlpha: 0.5,
    fillAlpha: 0.125,
  },
};

export function hashStringToUnit(value) {
  if (!value) {
    return 0;
  }
  let hash = 0;
  const str = String(value);
  for (let index = 0; index < str.length; index += 1) {
    hash = (hash * 31 + str.charCodeAt(index)) >>> 0;
  }
  return hash / 0xffffffff;
}

export function wrapHue(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function sampleHue(center, spread, seed) {
  const unit = hashStringToUnit(seed);
  const range = spread * 2;
  const hue = center - spread + unit * range;
  return wrapHue(hue);
}

export function hsvaToRgb(h, s, v) {
  const saturation = s / 100;
  const value = v / 100;
  const chroma = value * saturation;
  const hPrime = h / 60;
  const x = chroma * (1 - Math.abs((hPrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hPrime >= 0 && hPrime < 1) {
    r1 = chroma;
    g1 = x;
  } else if (hPrime >= 1 && hPrime < 2) {
    r1 = x;
    g1 = chroma;
  } else if (hPrime >= 2 && hPrime < 3) {
    g1 = chroma;
    b1 = x;
  } else if (hPrime >= 3 && hPrime < 4) {
    g1 = x;
    b1 = chroma;
  } else if (hPrime >= 4 && hPrime < 5) {
    r1 = x;
    b1 = chroma;
  } else if (hPrime >= 5 && hPrime < 6) {
    r1 = chroma;
    b1 = x;
  }
  const m = value - chroma;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
}

export function rgbToHex(r, g, b) {
  const toHex = (component) => component.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function buildColorSet(profile, seed, salt = "") {
  const hue = sampleHue(profile.hueCenter, profile.hueSpread, `${seed}:${salt}`);
  const { r, g, b } = hsvaToRgb(hue, profile.saturation, profile.value);
  const lineAlpha = profile.lineAlpha ?? 0.5;
  const fillAlpha = profile.fillAlpha ?? lineAlpha;
  return {
    stroke: `rgba(${r}, ${g}, ${b}, ${lineAlpha})`,
    fill: `rgba(${r}, ${g}, ${b}, ${fillAlpha})`,
    hex: rgbToHex(r, g, b),
  };
}

export function pickFieldColor(fieldType, seed) {
  const profile =
    fieldType === "WarningSafeBlanking"
      ? colorProfiles.FieldWarning
      : colorProfiles.FieldProtective;
  return buildColorSet(profile, seed);
}

export function pickTriOrbColor(seed) {
  return buildColorSet(colorProfiles.TriOrbShape, seed);
}

export function withAlpha(color, alpha) {
  if (!color || typeof color !== "string") {
    return `rgba(15, 23, 42, ${alpha})`;
  }
  if (!color.startsWith("#")) {
    return color;
  }
  let hex = color.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (hex.length !== 6) {
    return color;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveShapeStyle(fieldType, shapeType) {
  const normalizedField = String(fieldType || "").toLowerCase();
  const normalizedShape = String(shapeType || "").toLowerCase();
  const isProtective = normalizedField.includes("protective");
  const isWarning = normalizedField.includes("warning");
  const protectiveOrWarning = isProtective || isWarning;

  const style = {
    lineWidth: 1.5,
    lineDash: "solid",
  };

  if (normalizedShape === "field") {
    if (isWarning) {
      style.lineWidth = 1;
      style.lineDash = "solid";
    } else if (isProtective) {
      style.lineWidth = 2;
      style.lineDash = "solid";
    }
  } else if (normalizedShape === "cutout" && protectiveOrWarning) {
    style.lineWidth = 2;
    style.lineDash = "dash";
  }

  return style;
}
