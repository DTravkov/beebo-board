import { MAX_POINTS, type BoardShape } from '../shared/board';

export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
export const ERASER_RADIUS = 12;

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
      )
    : 0;
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

function inside(point: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}

function hitsPath(
  from: Point,
  to: Point,
  radius: number,
  points: Point[],
  closed = false,
  filled = false,
) {
  if (!points.length) return false;
  if (filled && (inside(from, points) || inside(to, points))) return true;
  if (points.length === 1)
    return distanceToSegment(points[0], from, to) <= radius * radius;
  const edges = closed ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++) {
    if (
      segmentDistance(from, to, points[i], points[(i + 1) % points.length]) <=
      radius * radius
    )
      return true;
  }
  return false;
}

export function shapeBounds(shape: BoardShape, textBounds?: Bounds): Bounds {
  if (shape.kind === 'text')
    return (
      textBounds ?? {
        x: shape.x,
        y: shape.y,
        width: shape.width || 360,
        height: shape.height || 30,
      }
    );
  if (shape.kind === 'stroke' || shape.kind === 'highlight') {
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < shape.points.length; i += 2) {
      left = Math.min(left, shape.points[i]);
      right = Math.max(right, shape.points[i]);
      top = Math.min(top, shape.points[i + 1]);
      bottom = Math.max(bottom, shape.points[i + 1]);
    }
    return {
      x: shape.x + left,
      y: shape.y + top,
      width: right - left,
      height: bottom - top,
    };
  }
  const signed = shape.kind === 'arrow' || shape.kind === 'sticky';
  return {
    x: shape.x + (signed ? Math.min(0, shape.width) : 0),
    y: shape.y + (signed ? Math.min(0, shape.height) : 0),
    width: Math.abs(shape.width),
    height: Math.abs(shape.height),
  };
}

/** A swept circular eraser, in board coordinates. Tests every object independently. */
export function eraserHits(
  shape: BoardShape,
  from: Point,
  to: Point,
  radius: number,
  textBounds?: Bounds,
) {
  const bounds = shapeBounds(shape, textBounds);
  const reach =
    radius + shape.strokeWidth / 2 + (shape.kind === 'arrow' ? 10 : 0);
  if (
    Math.max(from.x, to.x) + reach < bounds.x ||
    Math.min(from.x, to.x) - reach > bounds.x + bounds.width ||
    Math.max(from.y, to.y) + reach < bounds.y ||
    Math.min(from.y, to.y) - reach > bounds.y + bounds.height
  )
    return false;
  const origin = { x: shape.x, y: shape.y };
  if (shape.kind === 'stroke' || shape.kind === 'highlight') {
    const points: Point[] = [];
    for (let i = 0; i < shape.points.length; i += 2)
      points.push({
        x: shape.x + shape.points[i],
        y: shape.y + shape.points[i + 1],
      });
    return hitsPath(from, to, radius + shape.strokeWidth / 2, points);
  }
  if (shape.kind === 'arrow') {
    const end = { x: shape.x + shape.width, y: shape.y + shape.height };
    if (hitsPath(from, to, radius + shape.strokeWidth / 2, [origin, end]))
      return true;
    const angle = Math.atan2(shape.height, shape.width);
    const base = {
      x: end.x - 10 * Math.cos(angle),
      y: end.y - 10 * Math.sin(angle),
    };
    return hitsPath(
      from,
      to,
      radius + shape.strokeWidth / 2,
      [
        end,
        {
          x: base.x - 4.5 * Math.sin(angle),
          y: base.y + 4.5 * Math.cos(angle),
        },
        {
          x: base.x + 4.5 * Math.sin(angle),
          y: base.y - 4.5 * Math.cos(angle),
        },
      ],
      true,
      true,
    );
  }
  if (shape.kind === 'ellipse') {
    // Approximate the outline at a resolution finer than the brush; adapt to zoom/size.
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    const count = Math.max(
      32,
      Math.min(
        2048,
        Math.ceil(
          Math.PI * Math.sqrt(Math.max(rx, ry) / Math.max(radius / 16, 0.01)),
        ),
      ),
    );
    const points = Array.from({ length: count }, (_, i) => ({
      x: bounds.x + rx + rx * Math.cos((i * Math.PI * 2) / count),
      y: bounds.y + ry + ry * Math.sin((i * Math.PI * 2) / count),
    }));
    return hitsPath(
      from,
      to,
      radius + shape.strokeWidth / 2,
      points,
      true,
      shape.fill !== 'transparent',
    );
  }
  return hitsPath(
    from,
    to,
    radius + (shape.kind === 'rect' ? shape.strokeWidth / 2 : 0),
    [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ],
    true,
    shape.kind === 'frame'
      ? false
      : shape.kind !== 'rect' || shape.fill !== 'transparent',
  );
}

/**
 * Partial erase for freehand lines: removes only the ink under the eraser path
 * and returns the surviving pieces as new shapes. Returns null when the eraser
 * misses the line, and an empty array when the whole line is erased.
 */
export function splitStroke(
  shape: BoardShape,
  from: Point,
  to: Point,
  radius: number,
  makeId: () => string = () => crypto.randomUUID(),
): BoardShape[] | null {
  if (shape.kind !== 'stroke' && shape.kind !== 'highlight') return null;
  if (!eraserHits(shape, from, to, radius)) return null;
  const reach = (radius + shape.strokeWidth / 2) ** 2;
  // Resample long segments so the cut follows the eraser, not the sample spacing.
  const step = Math.max(1, radius / 3);
  const dense: Point[] = [];
  for (let i = 0; i < shape.points.length; i += 2) {
    const point = {
      x: shape.x + shape.points[i],
      y: shape.y + shape.points[i + 1],
    };
    const last = dense.at(-1);
    if (last) {
      const count = Math.min(
        64,
        Math.floor(Math.hypot(point.x - last.x, point.y - last.y) / step),
      );
      for (let k = 1; k < count; k++)
        dense.push({
          x: last.x + ((point.x - last.x) * k) / count,
          y: last.y + ((point.y - last.y) * k) / count,
        });
    }
    dense.push(point);
  }
  const pieces: Point[][] = [[]];
  for (const point of dense) {
    if (distanceToSegment(point, from, to) <= reach) {
      if (pieces.at(-1)!.length) pieces.push([]);
    } else pieces.at(-1)!.push(point);
  }
  return pieces
    .filter((piece) => piece.length >= 2)
    .map((piece) => {
      const origin = piece[0];
      const points: number[] = [];
      for (const point of piece.slice(0, MAX_POINTS / 2))
        points.push(point.x - origin.x, point.y - origin.y);
      return { ...shape, id: makeId(), x: origin.x, y: origin.y, points };
    });
}
