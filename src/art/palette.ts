/**
 * The HEADCOUNT palette. Everything is beige, gray-blue, or fluorescent-sick.
 * Numbers are 0xRRGGBB so Phaser can take them directly; `css()` for canvas work.
 */

export const PALETTE = {
  // Walls: pale yellow, the color of a room that has been smoked in since 1981.
  wallFace: 0xe8e0c0,
  wallShade: 0xd6cda6,
  wallEdge: 0xc0b58c,
  baseboard: 0xa89a6e,

  // Carpet: institutional gray-green, speckled to hide everything.
  carpet: 0xa0a293,
  carpetSpeckA: 0x94968a,
  carpetSpeckB: 0xacae9f,

  // Cubicle fabric: the gray-blue of a 1993 procurement decision.
  cubicleFace: 0x7e8a98,
  cubicleWeave: 0x74808e,
  cubicleTrim: 0x5c6672,
  cubicleTop: 0x9aa5b1,

  // Desks: brown veneer over particleboard.
  deskTop: 0xa3743f,
  deskEdge: 0x81572d,
  deskHighlight: 0xba8b56,

  // Hard flooring: break room and bathroom vinyl tile.
  vinylA: 0xdcd9cc,
  vinylB: 0xcecabb,
  grout: 0xb6b3a4,

  // Equipment beige. There is only one beige and this is it.
  applianceBody: 0xd8d2bc,
  applianceShade: 0xbdb79f,
  applianceDark: 0x4a4a46,
  paper: 0xf2f0e6,

  // Water cooler.
  coolerJug: 0xdde6ea,
  coolerWater: 0x5b86a2,
  coolerStand: 0xb9bec2,

  // IT closet.
  rack: 0x3a3e44,
  rackTrim: 0x54596180,
  ledGreen: 0x6fe08a,
  ledRed: 0xe06f6f,

  // Foliage, allegedly real.
  potTerracotta: 0x9c6b4a,
  leafDark: 0x466f3f,
  leafLight: 0x61945a,

  // Door frames.
  doorFrame: 0x6b5b3a,

  // The player, and eventually everyone else.
  skin: 0xd8b08c,
  skinShade: 0xbe9573,
  hair: 0x4a3a2a,
  shirt: 0xc8cdd6,
  shirtShade: 0xaeb4bf,
  tie: 0x8a3b3b,
  trousers: 0x4a4e58,
  trousersShade: 0x3c404a,
  shoe: 0x2c2c30,

  // Fluorescent wash laid over the whole world.
  fluorescent: 0xe8f0d8,

  // Windows 95 chrome, for the UI skin.
  win95Face: 0xc0c0c0,
  win95Light: 0xffffff,
  win95Shadow: 0x808080,
  win95DarkShadow: 0x000000,
  win95Title: 0x000080,
  win95TitleText: 0xffffff,
  win95Text: 0x000000,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** 0xRRGGBB -> "#rrggbb", for Canvas2D fills. */
export function css(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
