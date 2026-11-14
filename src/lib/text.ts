import Konva from 'konva';
import {
  FONTS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type BoardShape,
  type FontFamily,
  type TextAlign,
} from '../shared/board';

export const STICKY_PADDING = { x: 20, top: 23, bottom: 13 };
export const DEFAULT_TEXT_SIZE = 24;
export const SIZE_STEPS = [
  8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120, 144,
  200,
];

export type ResolvedText = {
  family: FontFamily;
  fontSize: number;
  fontFamily: string;
  fontStyle: 'bold' | 'normal';
  bold: boolean;
  align: TextAlign;
  lineHeight: number;
};

/** Text style with fallbacks for boards saved before text styling existed. */
export function textStyle(shape: BoardShape): ResolvedText {
  const sticky = shape.kind === 'sticky';
  const heading = shape.id === 'welcome';
  const family =
    shape.fontFamily ?? (heading ? 'serif' : ('sans' as FontFamily));
  const bold = shape.bold ?? heading;
  return {
    family,
    fontSize:
      shape.fontSize ??
      (sticky ? 16 : heading ? 38 : shape.id === 'subtitle' ? 16 : 22),
    fontFamily: FONTS[family].css,
    fontStyle: bold ? 'bold' : 'normal',
    bold,
    align: shape.align ?? 'left',
    lineHeight: sticky ? 1.45 : 1.35,
  };
}

export const clampFontSize = (size: number) =>
  Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size)));

export function stepFontSize(size: number, direction: 1 | -1) {
  if (direction > 0)
    return SIZE_STEPS.find((step) => step > size) ?? MAX_FONT_SIZE;
  return [...SIZE_STEPS].reverse().find((step) => step < size) ?? MIN_FONT_SIZE;
}

let probe: Konva.Text | null = null;
/** Measures text exactly as the canvas lays it out. */
export function measureText(shape: BoardShape, width?: number) {
  const style = textStyle(shape);
  probe ??= new Konva.Text();
  probe.setAttrs({
    text: shape.text || ' ',
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    width: width ?? ('auto' as unknown as number),
    wrap: width ? 'word' : 'none',
  });
  return { width: Math.ceil(probe.width()), height: Math.ceil(probe.height()) };
}

/** True when a text object's width was fitted to its content, not set by hand. */
export function hugsContent(shape: BoardShape | null) {
  return (
    !shape ||
    !shape.width ||
    Math.abs(measureText(shape).width + 2 - shape.width) <= 4
  );
}

/** Adds the refitted size to a style change on a text object. */
export function restyle(
  shape: BoardShape,
  patch: Partial<BoardShape>,
): Partial<BoardShape> {
  const styling = ['fontFamily', 'fontSize', 'bold'].some(
    (key) => key in patch,
  );
  if (shape.kind !== 'text' || !styling) return patch;
  return { ...patch, ...fitText(shape, { ...shape, ...patch }) };
}

/**
 * Final size of a text object after editing. Text that fit its content keeps
 * hugging it; text whose width was set by hand keeps that width and wraps.
 */
export function fitText(before: BoardShape | null, after: BoardShape) {
  const width = hugsContent(before)
    ? Math.min(1600, measureText(after).width + 2)
    : after.width;
  return { width, height: measureText(after, width).height };
}
