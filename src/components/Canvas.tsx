import { useEffect, useRef, useState } from 'react';
import {
  Stage,
  Layer,
  Group,
  Rect,
  Ellipse,
  Line,
  Arrow,
  Text,
  Circle,
} from 'react-konva';
import type Konva from 'konva';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  makeShape,
  MAX_POINTS,
  type BoardShape,
  type ShapeKind,
} from '../shared/board';
import type { Presence } from '../lib/room';
import {
  eraserHits,
  splitStroke,
  ERASER_RADIUS,
  type Bounds,
  type Point,
} from '../lib/eraser';

export type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'hand'
  | 'eraser'
  | 'eraser-partial';
export type View = { x: number; y: number; scale: number };
export type TextEditor = {
  id?: string;
  kind: 'text' | 'sticky';
  x: number;
  y: number;
  text: string;
};
type Props = {
  shapes: BoardShape[];
  tool: Tool;
  color: string;
  width: number;
  selected: string | null;
  view: View;
  lowBandwidth: boolean;
  presence: Presence[];
  onView: (view: View) => void;
  onSelect: (id: string | null) => void;
  onAdd: (shape: BoardShape) => void;
  onUpdate: (id: string, patch: Partial<BoardShape>) => void;
  onErase: (ids: string[]) => void;
  onSplice: (changes: { id: string; pieces: BoardShape[] }[]) => void;
  onEditText: (editor: TextEditor) => void;
  onCursor: (x: number, y: number) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
};

const HIGHLIGHT_OPACITY = 0.35;
const TRAIL_MS = 220;
const isBrush = (tool: Tool) => tool === 'pen' || tool === 'highlighter';
const isEraser = (tool: Tool) => tool === 'eraser' || tool === 'eraser-partial';
const isLine = (kind: ShapeKind) => kind === 'stroke' || kind === 'highlight';

function ShapeContent({ shape, scale }: { shape: BoardShape; scale: number }) {
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
        hitStrokeWidth={14 / scale}
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
        hitStrokeWidth={Math.max(14 / scale, shape.strokeWidth)}
      />
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
        hitStrokeWidth={14 / scale}
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
          x={20}
          y={23}
          width={shape.width - 40}
          height={shape.height - 36}
          fontSize={16}
          lineHeight={1.45}
          fontFamily="'Segoe UI', sans-serif"
          fill={shape.color}
        />
      </>
    );
  const heading = shape.id === 'welcome';
  return (
    <Text
      text={shape.text}
      width={shape.width || 360}
      fontSize={heading ? 38 : shape.id === 'subtitle' ? 16 : 22}
      fontStyle={heading ? 'bold' : 'normal'}
      lineHeight={1.35}
      fontFamily={heading ? 'Georgia, serif' : "'Segoe UI', sans-serif"}
      fill={shape.color}
    />
  );
}

export function Canvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [draft, setDraft] = useState<BoardShape | null>(null);
  const draftRef = useRef<BoardShape | null>(null);
  const [middlePanning, setMiddlePanning] = useState(false);
  const panGesture = useRef<{
    pointerId: number;
    start: Point;
    view: View;
    buttons: number;
  } | null>(null);
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const [brushCursor, setBrushCursor] = useState<Point | null>(null);
  // Short-lived gray trail behind the eraser, in screen coordinates.
  const trail = useRef<(Point & { t: number })[]>([]);
  const [trailPoints, setTrailPoints] = useState<Point[]>([]);
  const trailFrame = useRef(0);
  function fadeTrail() {
    const now = performance.now();
    trail.current = trail.current.filter((point) => now - point.t < TRAIL_MS);
    setTrailPoints(trail.current.map(({ x, y }) => ({ x, y })));
    trailFrame.current = trail.current.length
      ? requestAnimationFrame(fadeTrail)
      : 0;
  }
  function addTrail(point: Point) {
    trail.current.push({ ...point, t: performance.now() });
    if (!trailFrame.current)
      trailFrame.current = requestAnimationFrame(fadeTrail);
  }
  useEffect(() => () => cancelAnimationFrame(trailFrame.current), []);
  const erasing = useRef<{
    pointerId: number;
    last: Point | null;
    removed: Set<string>;
  } | null>(null);
  const shapeNodes = useRef(new Map<string, Konva.Group>());
  const panning = props.tool === 'hand' || middlePanning;
  function stopPanning() {
    const gesture = panGesture.current;
    panGesture.current = null;
    setMiddlePanning(false);
    if (gesture && host.current?.hasPointerCapture(gesture.pointerId))
      host.current.releasePointerCapture(gesture.pointerId);
  }
  function stopErasing() {
    const gesture = erasing.current;
    erasing.current = null;
    if (gesture && host.current?.hasPointerCapture(gesture.pointerId))
      host.current.releasePointerCapture(gesture.pointerId);
  }
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const blur = () => {
      stopPanning();
      stopErasing();
      setEraserCursor(null);
    };
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    draftRef.current = null;
    setDraft(null);
    stopPanning();
    stopErasing();
    setEraserCursor(null);
    setBrushCursor(null);
  }, [props.tool]);
  function pointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    return {
      screen,
      board: {
        x: (screen.x - props.view.x) / props.view.scale,
        y: (screen.y - props.view.y) / props.view.scale,
      },
      inside:
        screen.x >= 0 &&
        screen.y >= 0 &&
        screen.x <= rect.width &&
        screen.y <= rect.height,
    };
  }
  function eraseBetween(from: Point, to: Point) {
    const gesture = erasing.current;
    if (!gesture) return;
    const radius = ERASER_RADIUS / props.view.scale;
    if (props.tool === 'eraser-partial') {
      const changes: { id: string; pieces: BoardShape[] }[] = [];
      for (const shape of props.shapes) {
        if (gesture.removed.has(shape.id)) continue;
        const pieces = splitStroke(shape, from, to, radius);
        if (!pieces) continue;
        gesture.removed.add(shape.id);
        changes.push({ id: shape.id, pieces });
      }
      if (changes.length) props.onSplice(changes);
      return;
    }
    const ids: string[] = [];
    for (const shape of props.shapes) {
      if (gesture.removed.has(shape.id)) continue;
      let textBounds: Bounds | undefined;
      if (shape.kind === 'text') {
        const node = shapeNodes.current.get(shape.id)?.findOne('Text');
        const local = node?.getClientRect({
          skipTransform: true,
          skipShadow: true,
        });
        if (local)
          textBounds = { ...local, x: shape.x + local.x, y: shape.y + local.y };
      }
      if (
        eraserHits(
          shape,
          from,
          to,
          ERASER_RADIUS / props.view.scale,
          textBounds,
        )
      ) {
        gesture.removed.add(shape.id);
        ids.push(shape.id);
      }
    }
    if (ids.length) props.onErase(ids);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    host.current?.focus({ preventScroll: true });
    if (!event.isPrimary) return;
    if (event.button === 1 || (props.tool === 'hand' && event.button === 0)) {
      event.preventDefault();
      event.stopPropagation();
      stopErasing();
      draftRef.current = null;
      setDraft(null);
      setEraserCursor(null);
      panGesture.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        view: { ...props.view },
        buttons: event.button === 1 ? 4 : 1,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setMiddlePanning(event.button === 1);
      return;
    }
    if (
      !isEraser(props.tool) ||
      panning ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    event.preventDefault();
    const { screen, board } = pointer(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    erasing.current = {
      pointerId: event.pointerId,
      last: board,
      removed: new Set(),
    };
    setEraserCursor(screen);
    addTrail(screen);
    props.onSelect(null);
    eraseBetween(board, board);
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panGesture.current;
    if (pan && pan.pointerId === event.pointerId) {
      if (!(event.buttons & pan.buttons)) {
        stopPanning();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      props.onView({
        ...pan.view,
        x: pan.view.x + event.clientX - pan.start.x,
        y: pan.view.y + event.clientY - pan.start.y,
      });
      return;
    }
    if (panning) return;
    if (isBrush(props.tool)) {
      const { screen, inside } = pointer(event);
      setBrushCursor(inside ? screen : null);
      return;
    }
    if (!isEraser(props.tool)) return;
    const { screen, board, inside } = pointer(event);
    setEraserCursor(inside ? screen : null);
    const gesture = erasing.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      stopErasing();
      return;
    }
    if (!inside) {
      gesture.last = null;
      return;
    }
    props.onCursor(board.x, board.y);
    addTrail(screen);
    eraseBetween(gesture.last ?? board, board);
    gesture.last = board;
  }
  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (panGesture.current?.pointerId === event.pointerId) stopPanning();
    if (erasing.current?.pointerId === event.pointerId) stopErasing();
  }
  function point() {
    const pointer = props.stageRef.current?.getPointerPosition();
    return pointer
      ? {
          x: (pointer.x - props.view.x) / props.view.scale,
          y: (pointer.y - props.view.y) / props.view.scale,
        }
      : null;
  }
  function start(event: Konva.KonvaEventObject<PointerEvent>) {
    if (panning || event.evt.button > 0) return;
    const p = point();
    if (!p) return;
    if (props.tool === 'select' || isEraser(props.tool)) {
      if (event.target === event.target.getStage()) props.onSelect(null);
      return;
    }
    if (props.tool === 'text' || props.tool === 'sticky') {
      props.onEditText({ kind: props.tool, x: p.x, y: p.y, text: '' });
      return;
    }
    const kind: ShapeKind =
      props.tool === 'pen'
        ? 'stroke'
        : props.tool === 'highlighter'
          ? 'highlight'
          : (props.tool as ShapeKind);
    const shape = makeShape(kind, p.x, p.y, props.color);
    shape.strokeWidth = props.width;
    if (isLine(kind)) shape.points = [0, 0];
    draftRef.current = shape;
    setDraft(shape);
  }
  function move() {
    const p = point();
    if (!p) return;
    props.onCursor(p.x, p.y);
    const shape = draftRef.current;
    if (!shape) return;
    let next = { ...shape, width: p.x - shape.x, height: p.y - shape.y };
    if (isLine(shape.kind)) {
      const dx = p.x - shape.x;
      const dy = p.y - shape.y;
      const points = shape.points;
      if (
        points.length >= MAX_POINTS ||
        Math.hypot(dx - points.at(-2)!, dy - points.at(-1)!) <
          (props.lowBandwidth ? 4 : 1.5) / props.view.scale
      )
        return;
      next = { ...next, points: [...points, dx, dy] };
    }
    draftRef.current = next;
    setDraft(next);
  }
  function finish() {
    let shape = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!shape) return;
    if (isLine(shape.kind) && shape.points.length === 2)
      shape = { ...shape, points: [0, 0, 0.1, 0.1] };
    if (!isLine(shape.kind) && Math.hypot(shape.width, shape.height) < 3)
      return;
    if (shape.kind === 'rect' || shape.kind === 'ellipse')
      shape = {
        ...shape,
        x: shape.x + Math.min(0, shape.width),
        y: shape.y + Math.min(0, shape.height),
        width: Math.abs(shape.width),
        height: Math.abs(shape.height),
      };
    props.onAdd(shape);
  }
  function zoom(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    if (panGesture.current) return;
    const p = point();
    const pointer = props.stageRef.current?.getPointerPosition();
    if (!p || !pointer) return;
    const scale = Math.max(
      0.2,
      Math.min(3, props.view.scale * (event.evt.deltaY < 0 ? 1.08 : 1 / 1.08)),
    );
    props.onView({
      scale,
      x: pointer.x - p.x * scale,
      y: pointer.y - p.y * scale,
    });
  }
  return (
    <div
      ref={host}
      tabIndex={0}
      onPointerDownCapture={pointerDown}
      onPointerMoveCapture={pointerMove}
      onPointerUpCapture={endPointer}
      onPointerCancelCapture={endPointer}
      onLostPointerCapture={endPointer}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onPointerLeave={() => {
        setEraserCursor(null);
        setBrushCursor(null);
      }}
      className={`canvas-host cursor-${panning ? 'hand' : props.tool}${panning ? ' is-panning' : ''}`}
      style={{
        backgroundSize: `${24 * props.view.scale}px ${24 * props.view.scale}px`,
        backgroundPosition: `${props.view.x}px ${props.view.y}px`,
      }}
      role="region"
      aria-label="Whiteboard canvas. Use the Objects panel for keyboard editing."
    >
      <Stage
        ref={props.stageRef}
        width={size.width}
        height={size.height}
        x={props.view.x}
        y={props.view.y}
        scaleX={props.view.scale}
        scaleY={props.view.scale}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerLeave={finish}
        onPointerCancel={() => {
          draftRef.current = null;
          setDraft(null);
        }}
        onWheel={zoom}
      >
        <Layer>
          {props.shapes.map((shape) => (
            <Group
              key={shape.id}
              ref={(node) => {
                if (node) shapeNodes.current.set(shape.id, node);
                else shapeNodes.current.delete(shape.id);
              }}
              x={shape.x}
              y={shape.y}
              draggable={props.tool === 'select' && !panning}
              onPointerDown={(event) => {
                if (props.tool === 'select' && !panning) {
                  event.cancelBubble = true;
                  props.onSelect(shape.id);
                }
              }}
              onDblClick={() => {
                if (
                  props.tool === 'select' &&
                  (shape.kind === 'text' || shape.kind === 'sticky')
                )
                  props.onEditText({
                    id: shape.id,
                    kind: shape.kind,
                    x: shape.x,
                    y: shape.y,
                    text: shape.text,
                  });
              }}
              onDblTap={() => {
                if (
                  props.tool === 'select' &&
                  (shape.kind === 'text' || shape.kind === 'sticky')
                )
                  props.onEditText({
                    id: shape.id,
                    kind: shape.kind,
                    x: shape.x,
                    y: shape.y,
                    text: shape.text,
                  });
              }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                props.onUpdate(shape.id, {
                  x: event.currentTarget.x(),
                  y: event.currentTarget.y(),
                });
              }}
            >
              {props.tool === 'select' &&
                (shape.kind === 'rect' || shape.kind === 'ellipse') && (
                  <Rect
                    width={Math.abs(shape.width)}
                    height={Math.abs(shape.height)}
                    fill="transparent"
                  />
                )}
              <ShapeContent shape={shape} scale={props.view.scale} />
              {props.selected === shape.id && (
                <Rect
                  x={-6}
                  y={-6}
                  width={Math.max(20, Math.abs(shape.width) || 360) + 12}
                  height={Math.max(24, Math.abs(shape.height) || 40) + 12}
                  stroke="#71944d"
                  strokeWidth={1.5 / props.view.scale}
                  dash={[5, 4]}
                  listening={false}
                />
              )}
            </Group>
          ))}
          {draft && (
            <Group x={draft.x} y={draft.y} listening={false}>
              <ShapeContent shape={draft} scale={props.view.scale} />
            </Group>
          )}
        </Layer>
        <Layer listening={false}>
          {props.presence.map((person) => (
            <Group key={person.id} x={person.x} y={person.y}>
              <Line
                points={[0, 0, 3, 17, 7, 12, 14, 12, 0, 0]}
                fill={person.color}
                stroke="#ffffff"
                strokeWidth={1}
                closed
              />
              <Rect
                x={12}
                y={18}
                width={Math.min(180, person.name.length * 7 + 20)}
                height={25}
                fill={person.color}
                cornerRadius={6}
              />
              <Text
                text={person.name}
                x={21}
                y={25}
                fontSize={12}
                fill="#ffffff"
              />
            </Group>
          ))}
          <Circle x={-100} y={-100} radius={0} />
        </Layer>
      </Stage>
      {trailPoints.length > 1 && (
        <svg className="eraser-trail" aria-hidden="true">
          <polyline
            points={trailPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#8a8f88"
            strokeOpacity={0.35}
            strokeWidth={ERASER_RADIUS * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {isEraser(props.tool) && !panning && eraserCursor && (
        <span
          className={`eraser-cursor${props.tool === 'eraser-partial' ? ' partial' : ''}`}
          aria-hidden="true"
          style={{ left: eraserCursor.x, top: eraserCursor.y }}
        />
      )}
      {isBrush(props.tool) && !panning && brushCursor && (
        <span
          className="brush-cursor"
          aria-hidden="true"
          style={{
            left: brushCursor.x,
            top: brushCursor.y,
            width: Math.max(6, props.width * props.view.scale),
            height: Math.max(6, props.width * props.view.scale),
            background: props.color,
            opacity:
              props.tool === 'highlighter' ? HIGHLIGHT_OPACITY + 0.15 : 1,
          }}
        />
      )}
    </div>
  );
}
