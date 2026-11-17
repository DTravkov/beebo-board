import type { BoardShape } from '../../shared/board';
import { shapeBounds, type Bounds, type Point } from '../../lib/eraser';

export function normalise(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
export function intersects(a: Bounds, b: Bounds) {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}
export function contains(outer: Bounds, inner: Bounds) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
export function union(boxes: Bounds[]): Bounds {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}
/** Objects lying fully inside a frame; they move with it. */
export function framed(frame: BoardShape, shapes: BoardShape[]) {
  return shapes.filter((shape) => {
    if (shape.id === frame.id || shape.kind === 'frame') return false;
    const box = shapeBounds(shape);
    return (
      box.x >= frame.x &&
      box.y >= frame.y &&
      box.x + box.width <= frame.x + frame.width &&
      box.y + box.height <= frame.y + frame.height
    );
  });
}
