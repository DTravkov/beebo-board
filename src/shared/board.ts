export const MAX_OBJECTS = 1000;
export const MAX_POINTS = 8000;
export const MAX_DOCUMENT_BYTES = 2_000_000;
export type ShapeKind =
  | 'stroke'
  | 'highlight'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'frame';
export type BoardShape = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  points: number[];
  color: string;
  fill: string;
  strokeWidth: number;
  text: string;
  /** Optional text styling for text and sticky notes. */
  fontFamily?: FontFamily;
  fontSize?: number;
  bold?: boolean;
  align?: TextAlign;
};
export type FontFamily = 'sans' | 'serif' | 'mono' | 'hand';
export type TextAlign = 'left' | 'center' | 'right';
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
// System fonts only: the project avoids loading remote assets.
export const FONTS: Record<FontFamily, { label: string; css: string }> = {
  sans: { label: 'Sans', css: "'Segoe UI', system-ui, sans-serif" },
  serif: { label: 'Serif', css: 'Georgia, serif' },
  mono: { label: 'Mono', css: "Consolas, 'Courier New', monospace" },
  hand: {
    label: 'Hand',
    css: "'Segoe Print', 'Comic Sans MS', 'Chalkboard SE', cursive",
  },
};
const optionalKeys = new Set(['fontFamily', 'fontSize', 'bold', 'align']);
export type BoardFile = {
  format: 'beebo-board';
  version: 1;
  title: string;
  shapes: BoardShape[];
};
const kinds = new Set([
  'stroke',
  'highlight',
  'rect',
  'ellipse',
  'arrow',
  'text',
  'sticky',
  'frame',
]);
const shapeKeys = new Set([
  'id',
  'kind',
  'x',
  'y',
  'width',
  'height',
  'points',
  'color',
  'fill',
  'strokeWidth',
  'text',
]);
const coordinate = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1_000_000;
const color = (value: unknown): value is string =>
  typeof value === 'string' && /^(#[a-f0-9]{6}|transparent)$/i.test(value);

export function isShape(value: unknown): value is BoardShape {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    [...shapeKeys].every((key) => key in s) &&
    Object.keys(s).every(
      (key) => shapeKeys.has(key) || optionalKeys.has(key),
    ) &&
    (s.fontFamily === undefined ||
      (typeof s.fontFamily === 'string' &&
        Object.hasOwn(FONTS, s.fontFamily))) &&
    (s.fontSize === undefined ||
      (typeof s.fontSize === 'number' &&
        s.fontSize >= MIN_FONT_SIZE &&
        s.fontSize <= MAX_FONT_SIZE)) &&
    (s.bold === undefined || typeof s.bold === 'boolean') &&
    (s.align === undefined ||
      s.align === 'left' ||
      s.align === 'center' ||
      s.align === 'right') &&
    typeof s.id === 'string' &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(s.id) &&
    typeof s.kind === 'string' &&
    kinds.has(s.kind) &&
    coordinate(s.x) &&
    coordinate(s.y) &&
    coordinate(s.width) &&
    coordinate(s.height) &&
    Array.isArray(s.points) &&
    s.points.length <= MAX_POINTS &&
    s.points.length % 2 === 0 &&
    s.points.every(coordinate) &&
    color(s.color) &&
    color(s.fill) &&
    typeof s.strokeWidth === 'number' &&
    s.strokeWidth >= 1 &&
    s.strokeWidth <= 24 &&
    typeof s.text === 'string' &&
    s.text.length <= 2000
  );
}

export function parseBoard(input: string): BoardFile {
  if (new TextEncoder().encode(input).length > MAX_DOCUMENT_BYTES)
    throw new Error('This file is too large. The limit is 2 MB.');
  let board: Partial<BoardFile>;
  try {
    board = JSON.parse(input);
  } catch {
    throw new Error('Choose a valid Beebo JSON board file.');
  }
  if (!board || board.format !== 'beebo-board' || board.version !== 1)
    throw new Error('This board format or version is not supported.');
  if (typeof board.title !== 'string' || board.title.length > 120)
    throw new Error('Board titles must be at most 120 characters.');
  if (
    !Array.isArray(board.shapes) ||
    board.shapes.length > MAX_OBJECTS ||
    !board.shapes.every(isShape)
  )
    throw new Error(
      'The board contains invalid objects or exceeds 1,000 objects.',
    );
  if (
    new Set(board.shapes.map((shape) => shape.id)).size !== board.shapes.length
  )
    throw new Error('The board contains duplicate object IDs.');
  return board as BoardFile;
}

export function makeShape(
  kind: ShapeKind,
  x: number,
  y: number,
  colorValue = '#34483e',
): BoardShape {
  return {
    id: crypto.randomUUID(),
    kind,
    x,
    y,
    width: 0,
    height: 0,
    points: [],
    color: colorValue,
    fill: 'transparent',
    strokeWidth: 3,
    text: '',
  };
}

export const sampleShapes: BoardShape[] = [
  {
    id: 'welcome',
    kind: 'text',
    x: 235,
    y: 158,
    width: 550,
    height: 64,
    points: [],
    color: '#30463a',
    fill: 'transparent',
    strokeWidth: 2,
    text: 'Good ideas start here.',
  },
  {
    id: 'subtitle',
    kind: 'text',
    x: 238,
    y: 218,
    width: 550,
    height: 36,
    points: [],
    color: '#788478',
    fill: 'transparent',
    strokeWidth: 1,
    text: 'Make a little room for your next big thing.',
  },
  {
    id: 'note-1',
    kind: 'sticky',
    x: 237,
    y: 312,
    width: 205,
    height: 175,
    points: [],
    color: '#34483e',
    fill: '#f5e7a1',
    strokeWidth: 2,
    text: 'What if we tried\nsomething new?\n\nStart with a question.',
  },
  {
    id: 'note-2',
    kind: 'sticky',
    x: 487,
    y: 292,
    width: 205,
    height: 175,
    points: [],
    color: '#34483e',
    fill: '#dce8cf',
    strokeWidth: 2,
    text: 'A space to learn,\nsketch, and connect.\n\nEveryone belongs.',
  },
  {
    id: 'note-3',
    kind: 'sticky',
    x: 737,
    y: 325,
    width: 205,
    height: 175,
    points: [],
    color: '#34483e',
    fill: '#eadff0',
    strokeWidth: 2,
    text: 'There’s no wrong\nplace to begin.\n\nMake your mark ↗',
  },
  {
    id: 'connection',
    kind: 'arrow',
    x: 454,
    y: 389,
    width: 23,
    height: -10,
    points: [],
    color: '#8d9f88',
    fill: 'transparent',
    strokeWidth: 2,
    text: '',
  },
];
