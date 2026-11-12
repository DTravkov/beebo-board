import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraserHits, shapeBounds } from '../src/lib/eraser';
import { makeShape } from '../src/shared/board';

test('a fast eraser sweep hits thin strokes and arrowheads between pointer samples', () => {
  const stroke = makeShape('stroke', 200, 100);
  stroke.points = [0, 0, 0, 100];
  assert.equal(
    eraserHits(stroke, { x: 0, y: 150 }, { x: 500, y: 150 }, 12),
    true,
  );
  assert.equal(
    eraserHits(stroke, { x: 0, y: 220 }, { x: 500, y: 220 }, 12),
    false,
  );
  const arrow = makeShape('arrow', 300, 200);
  arrow.width = -100;
  arrow.height = -100;
  assert.equal(
    eraserHits(arrow, { x: 200, y: 100 }, { x: 200, y: 100 }, 1),
    true,
  );
  assert.equal(
    eraserHits(arrow, { x: 203, y: 109 }, { x: 203, y: 109 }, 1),
    true,
  );
});

test('eraser respects empty interiors and curved outlines instead of deleting bounding-box neighbors', () => {
  const rect = makeShape('rect', 0, 0);
  rect.width = 100;
  rect.height = 100;
  assert.equal(eraserHits(rect, { x: 50, y: 50 }, { x: 60, y: 60 }, 12), false);
  assert.equal(
    eraserHits(rect, { x: -50, y: 50 }, { x: 150, y: 50 }, 12),
    true,
  );
  rect.fill = '#f5e7a1';
  assert.equal(eraserHits(rect, { x: 50, y: 50 }, { x: 50, y: 50 }, 12), true);
  const ellipse = { ...rect, kind: 'ellipse' as const, fill: 'transparent' };
  assert.equal(eraserHits(ellipse, { x: 0, y: 0 }, { x: 0, y: 0 }, 4), false);
  assert.equal(
    eraserHits(ellipse, { x: 50, y: 50 }, { x: 50, y: 50 }, 4),
    false,
  );
  assert.equal(eraserHits(ellipse, { x: 0, y: 50 }, { x: 0, y: 50 }, 4), true);
  const stroke = makeShape('stroke', 0, 0);
  stroke.points = [0, 0, 100, 0, 100, 100];
  assert.equal(
    eraserHits(stroke, { x: 20, y: 80 }, { x: 30, y: 80 }, 4),
    false,
  );
});

test('collision radius follows zoom, and text uses its rendered multiline bounds', () => {
  const stroke = makeShape('stroke', 100, 100);
  stroke.points = [0, 0, 0, 100];
  assert.equal(
    eraserHits(stroke, { x: 120, y: 150 }, { x: 120, y: 150 }, 12),
    false,
  );
  assert.equal(
    eraserHits(stroke, { x: 120, y: 150 }, { x: 120, y: 150 }, 24),
    true,
  );
  const text = makeShape('text', 200, 200);
  text.width = 200;
  text.height = 30;
  assert.equal(
    eraserHits(text, { x: 250, y: 350 }, { x: 250, y: 350 }, 12, {
      x: 200,
      y: 200,
      width: 200,
      height: 180,
    }),
    true,
  );
  assert.deepEqual(shapeBounds({ ...stroke, points: [-50, -40, 100, 80] }), {
    x: 50,
    y: 60,
    width: 150,
    height: 120,
  });
});
