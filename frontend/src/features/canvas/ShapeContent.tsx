import { Rect, Ellipse, Line, Arrow, Text } from 'react-konva';
import type { BoardShape } from '../../shared/board';
import { STICKY_PADDING, textStyle } from '../../lib/text';
import { BoardImage } from './BoardImage';

export const HIGHLIGHT_OPACITY = 0.35;
// Keep selection targets usable in screen pixels as visible strokes scale.
const SELECTION_HIT_WIDTH = 28;

export function ShapeContent({
  shape,
  scale,
}: {
  shape: BoardShape;
  scale: number;
}) {
  const common = {
    stroke: shape.color,
    strokeWidth: shape.strokeWidth,
    fill: shape.fill,
  };
  if (shape.kind === 'stroke')
    return (
      <Line
        points={shape.points}
        stroke={shape.color}
        strokeWidth={shape.strokeWidth}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={Math.max(
          SELECTION_HIT_WIDTH / scale,
          shape.strokeWidth,
        )}
      />
    );
  if (shape.kind === 'highlight')
    return (
      <Line
        points={shape.points}
        stroke={shape.color}
        strokeWidth={shape.strokeWidth}
        opacity={HIGHLIGHT_OPACITY}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={Math.max(
          SELECTION_HIT_WIDTH / scale,
          shape.strokeWidth,
        )}
      />
    );
  if (shape.kind === 'image') return <BoardImage shape={shape} />;
  if (shape.kind === 'frame')
    return (
      <>
        <Text
          text={shape.text}
          y={-22 / scale}
          fontSize={13 / scale}
          fontFamily="'Segoe UI', sans-serif"
          fill="#7d897f"
          listening={false}
        />
        <Rect
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          stroke={shape.color}
          strokeWidth={1 / scale}
          shadowColor="#263b28"
          shadowOpacity={0.06}
          shadowBlur={14}
          shadowOffsetY={3}
        />
      </>
    );
  if (shape.kind === 'arrow')
    return (
      <Arrow
        points={[0, 0, shape.width, shape.height]}
        stroke={shape.color}
        fill={shape.color}
        strokeWidth={shape.strokeWidth}
        pointerLength={10}
        pointerWidth={9}
        hitStrokeWidth={Math.max(
          SELECTION_HIT_WIDTH / scale,
          shape.strokeWidth,
        )}
      />
    );
  if (shape.kind === 'rect')
    return (
      <Rect
        width={Math.abs(shape.width)}
        height={Math.abs(shape.height)}
        cornerRadius={6}
        {...common}
      />
    );
  if (shape.kind === 'ellipse')
    return (
      <Ellipse
        x={Math.abs(shape.width) / 2}
        y={Math.abs(shape.height) / 2}
        radiusX={Math.abs(shape.width) / 2}
        radiusY={Math.abs(shape.height) / 2}
        {...common}
      />
    );
  const sticky = textStyle(shape);
  if (shape.kind === 'sticky')
    return (
      <>
        <Rect
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          cornerRadius={3}
          shadowColor="#263b28"
          shadowOpacity={0.075}
          shadowBlur={12}
          shadowOffsetY={5}
        />
        <Rect
          x={0}
          y={shape.height - 23}
          width={shape.width}
          height={23}
          fill="rgba(0,0,0,0.025)"
          cornerRadius={[0, 0, 3, 3]}
        />
        <Text
          text={shape.text}
          x={STICKY_PADDING.x}
          y={STICKY_PADDING.top}
          width={shape.width - STICKY_PADDING.x * 2}
          height={shape.height - STICKY_PADDING.top - STICKY_PADDING.bottom}
          fontSize={sticky.fontSize}
          fontStyle={sticky.fontStyle}
          align={sticky.align}
          lineHeight={sticky.lineHeight}
          fontFamily={sticky.fontFamily}
          fill={shape.color}
        />
      </>
    );
  const style = textStyle(shape);
  return (
    <Text
      text={shape.text}
      width={shape.width || 360}
      fontSize={style.fontSize}
      fontStyle={style.fontStyle}
      align={style.align}
      lineHeight={style.lineHeight}
      fontFamily={style.fontFamily}
      fill={shape.color}
    />
  );
}
