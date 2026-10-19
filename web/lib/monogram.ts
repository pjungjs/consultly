// Studio look: each consultant gets a stable, muted colour for their monogram tile.
const TILE_COLOURS = ["#7a2e3a", "#3e5c47", "#34506e", "#7a5a2e", "#5b3f6b"];

export function monogram(name: string) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return { initials, colour: TILE_COLOURS[hash % TILE_COLOURS.length] };
}
