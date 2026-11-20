// Site palettes. The theme is a set of CSS variables (see globals.css). Three fixed palettes, plus
// one built from a team's two school colors for "champion's colors" weeks. Pure functions, no I/O.

export type PaletteName = "field" | "night" | "arcade";

/** The CSS variables a palette sets (names without the leading "--"). */
export type ThemeVars = {
  background: string;
  "field-2": string;
  card: string;
  popover: string;
  primary: string;
  secondary: string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  "sidebar-primary": string;
  "sidebar-ring": string;
};

const fixed = (v: Omit<ThemeVars, "popover" | "ring" | "sidebar" | "sidebar-primary" | "sidebar-ring">): ThemeVars => ({
  ...v,
  popover: v.card,
  ring: v.primary,
  sidebar: v.card,
  "sidebar-primary": v.primary,
  "sidebar-ring": v.primary,
});

/** Must match the :root defaults in globals.css (field) — the server only sends what differs. */
export const PALETTES: Record<PaletteName, ThemeVars> = {
  field: fixed({
    background: "#1d6b34", "field-2": "#237a3d", card: "#0d110e", primary: "#ffd23f", secondary: "#1f2a22", muted: "#1f2a22",
    "muted-foreground": "#cfe3d3", accent: "#ff7a3d", border: "#34433a", input: "#4a5d50",
  }),
  night: fixed({
    background: "#10204a", "field-2": "#142757", card: "#070a14", primary: "#5fd4ff", secondary: "#1a2340", muted: "#1a2340",
    "muted-foreground": "#c3cfea", accent: "#ffa62b", border: "#2c3858", input: "#46557a",
  }),
  arcade: fixed({
    background: "#2a0f3b", "field-2": "#331248", card: "#0b0612", primary: "#3dff8f", secondary: "#261835", muted: "#261835",
    "muted-foreground": "#dcc7e8", accent: "#ff5ad9", border: "#3f2c55", input: "#5b4475",
  }),
};

// ---------------------------------------------------------------------------
// Color math (sRGB hex ↔ HSL, WCAG contrast)
// ---------------------------------------------------------------------------

type Hsl = { h: number; s: number; l: number };

export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: [number, number, number]) => "#" + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");

function rgbToHsl([r, g, b]: [number, number, number]): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex)!.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. 4.5 is the minimum for body text. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** How colorful (0–1): HSL chroma. Grays, black and white are near 0. */
const chroma = ({ s, l }: Hsl) => s * (1 - Math.abs(2 * l - 1));

/** Same hue and saturation, lightness moved step by step until `ok` holds (or it runs out). */
function adjustLightness(hsl: Hsl, direction: 1 | -1, ok: (hex: string) => boolean): string {
  let { l } = hsl;
  for (let i = 0; i < 100; i++) {
    const hex = hslToHex({ ...hsl, l });
    if (ok(hex)) return hex;
    l = Math.min(1, Math.max(0, l + direction * 0.01));
  }
  return hslToHex({ ...hsl, l });
}

// ---------------------------------------------------------------------------
// Team palette
// ---------------------------------------------------------------------------

const WHITE = "#ffffff";
const BLACK = "#000000";
const GOLD = "#ffd23f";

/**
 * Turns a school's two colors into a site palette.
 * - Field (page background): the most colorful school color, darkened until white text reads on it.
 * - Primary (headings, leader row, main buttons; black text on it): the other school color if it's
 *   colorful or light, else the field color lightened; always bright enough to read on near-black.
 * - Accent (season label, "You" tag): whichever school color primary didn't use, lightened, or white.
 * Colors that already pass are used exactly. Teams with no colorful color (missing, or only black,
 * white and grays) keep the default field green.
 * `base` (a special week's palette) keeps its own field and panels; only the highlight colors change.
 */
export function teamPalette(color: string | null, altColor: string | null, base: PaletteName = "field"): ThemeVars {
  const colors = [color, altColor].map(parseHex).filter((c): c is [number, number, number] => !!c).map((rgb) => ({ hex: toHex(rgb), hsl: rgbToHsl(rgb) }));
  const colorful = colors.filter((c) => chroma(c.hsl) >= 0.15);
  // Readable as a highlight on near-black panels and under black text.
  const bright = (c: { hex: string; hsl: Hsl }) =>
    contrast(c.hex, BLACK) >= 6 ? c.hex : adjustLightness({ ...c.hsl, s: Math.min(c.hsl.s, 0.9) }, 1, (hex) => contrast(hex, BLACK) >= 6);
  // Light grays/white work as a highlight; black and dark grays don't.
  const usable = (c: { hsl: Hsl }) => chroma(c.hsl) >= 0.15 || c.hsl.l >= 0.55;

  // The same colors are picked for every base, so a team looks like itself in special weeks too.
  const fieldColor = colorful[0];
  const others = colors.filter((c) => c !== fieldColor && usable(c));
  const highlights = [
    ...others.filter((c) => chroma(c.hsl) >= 0.15),
    ...(fieldColor ? [fieldColor] : colorful),
    ...others.filter((c) => chroma(c.hsl) < 0.15),
  ];
  const primary = highlights[0] ? bright(highlights[0]) : GOLD;
  const accent = highlights[1] ? bright(highlights[1]) : !fieldColor ? PALETTES[base].accent : WHITE;

  if (!fieldColor || base !== "field") {
    const b = PALETTES[base];
    return { ...b, primary, accent, ring: primary, "sidebar-primary": primary, "sidebar-ring": primary };
  }

  const { h, s } = fieldColor.hsl;
  // A school color that's already dark enough is used exactly; otherwise it's darkened.
  const background =
    contrast(WHITE, fieldColor.hex) >= 7 ? fieldColor.hex : adjustLightness({ h, s, l: Math.min(fieldColor.hsl.l, 0.32) }, -1, (hex) => contrast(WHITE, hex) >= 7);
  const bgL = rgbToHsl(parseHex(background)!).l;
  const tint = (sat: number, l: number) => hslToHex({ h, s: Math.min(s, sat), l });
  const card = tint(0.35, 0.06);
  const muted = tint(0.25, 0.14);
  const mutedForeground = adjustLightness({ h, s: Math.min(s, 0.3), l: 0.86 }, 1, (hex) => contrast(hex, background) >= 4.5 && contrast(hex, muted) >= 4.5);
  return {
    background,
    "field-2": hslToHex({ h, s, l: Math.min(bgL + 0.035, 0.4) }),
    card,
    popover: card,
    primary,
    secondary: muted,
    muted,
    "muted-foreground": mutedForeground,
    accent,
    border: tint(0.2, 0.24),
    input: tint(0.18, 0.36),
    ring: primary,
    sidebar: card,
    "sidebar-primary": primary,
    "sidebar-ring": primary,
  };
}

/** The `:root { … }` rule for a palette, or "" when it's the default (globals.css already has it). */
export function themeCss(vars: ThemeVars): string {
  const changed = (Object.keys(vars) as (keyof ThemeVars)[]).filter((k) => vars[k] !== PALETTES.field[k]);
  if (!changed.length) return "";
  return `:root{${changed.map((k) => `--${k}:${vars[k]}`).join(";")}}`;
}
