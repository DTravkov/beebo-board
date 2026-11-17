import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Stage, Layer, Group, Rect, Circle, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  makeShape,
  MAX_POINTS,
  type BoardShape,
  type ShapeKind,
} from '../../shared/board';
import type { Presence } from '../../lib/room';
import { RemoteCursor } from './RemoteCursor';
import { useCanvasDensity } from './useCanvasDensity';
import { ShapeContent, HIGHLIGHT_OPACITY } from './ShapeContent';
import { InlineText } from './InlineText';
import { normalise, intersects, contains, union, framed } from './geometry';
import type { Editing, Tool, View } from './types';
import {
  clampFontSize,
  DEFAULT_TEXT_SIZE,
  fitText,
  measureText,
  textStyle,
} from '../../lib/text';
import {
  eraserHits,
  shapeBounds,
  splitStroke,
  ERASER_RADIUS,
  type Bounds,
  type Point,
} from '../../lib/eraser';

type Props = {
  shapes: BoardShape[];
  tool: Tool;
  color: string;
  width: number;
  /** Diameter of the partial eraser in screen pixels. */
  partialEraserSize: number;
  /** Ids of the selected objects, in selection order. */
  selected: string[];
  view: View;
  presence: Presence[];
  onView: (view: View) => void;
  onSelect: (ids: string[]) => void;
  onAdd: (shape: BoardShape) => void;
  onUpdate: (id: string, patch: Partial<BoardShape>) => void;
  /** Moves several objects in one undo step. */
  onMove: (changes: { id: string; x: number; y: number }[]) => void;
  onErase: (ids: string[]) => void;
  onSplice: (changes: { id: string; pieces: BoardShape[] }[]) => void;
  onCursor: (x: number, y: number) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  /** Called after a new text or note is placed, so the app can switch back to Select. */
  onToolDone: () => void;
  /** Floating controls shown above the selected object. */
  renderToolbar: (shape: BoardShape) => ReactNode;
  /** Floating controls shown above a group of selected objects. */
  renderGroupToolbar: (shapes: BoardShape[]) => ReactNode;
};
type Marquee = { from: Point; to: Point; additive: boolean; base: string[] };
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const SIDES = ['middle-left', 'middle-right'];

const TRAIL_MS = 220;
const isBrush = (tool: Tool) => tool === 'pen' || tool === 'highlighter';
const isEraser = (tool: Tool) => tool === 'eraser' || tool === 'eraser-partial';
const isLine = (kind: ShapeKind) => kind === 'stroke' || kind === 'highlight';

export function Canvas(props: Props) {
  useCanvasDensity(props.stageRef);
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
  const eraserRadius =
    props.tool === 'eraser-partial'
      ? props.partialEraserSize / 2
      : ERASER_RADIUS;
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
  const transformer = useRef<Konva.Transformer>(null);
  const carry = useRef<BoardShape[]>([]);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Set when a press on the canvas ended an edit, so that press does nothing else.
  const pressEndedEdit = useRef(false);
  const [moving, setMoving] = useState(false);
  const [marquee, setMarqueeState] = useState<Marquee | null>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  function setMarquee(next: Marquee | null) {
    marqueeRef.current = next;
    setMarqueeState(next);
  }
  const [toolbarAt, setToolbarAt] = useState<{
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  function setEditing(next: Editing | null) {
    editingRef.current = next;
    setEditingState(next);
  }
  function beginEdit(shape: BoardShape, isNew: boolean) {
    props.onSelect(isNew ? [] : [shape.id]);
    setEditing({ shape, before: isNew ? null : shape });
  }
  function commitEdit() {
    const current = editingRef.current;
    if (!current) return;
    setEditing(null);
    const shape = { ...current.shape, text: current.shape.text.trimEnd() };
    if (shape.kind === 'text') {
      if (!shape.text.trim()) {
        if (current.before) props.onErase([shape.id]);
        return;
      }
      Object.assign(shape, fitText(current.before, shape));
    }
    if (current.before)
      props.onUpdate(shape.id, {
        text: shape.text,
        width: shape.width,
        height: shape.height,
      });
    else {
      props.onAdd(shape);
      props.onToolDone();
    }
    props.onSelect([shape.id]);
  }
  const selectedShapes = props.shapes.filter((shape) =>
    props.selected.includes(shape.id),
  );
  const multiple = selectedShapes.length > 1;
  const selectedShape = selectedShapes.length === 1 ? selectedShapes[0] : null;
  const showHandles =
    props.tool === 'select' &&
    !middlePanning &&
    selectedShapes.length > 0 &&
    !selectedShapes.some((shape) => shape.id === editing?.shape.id);
  function selectedNodes() {
    if (!showHandles) return [];
    return props.selected
      .map((id) => shapeNodes.current.get(id))
      .filter((node): node is Konva.Group => !!node);
  }
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
    if (!editing) return;
    const input = textarea.current;
    if (input && editing.shape.kind === 'text') {
      input.style.height = '0px';
      input.style.height = `${input.scrollHeight}px`;
    }
    if (!input || document.activeElement === input) return;
    const focus = () => {
      if (document.activeElement === input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    };
    focus();
    // The browser's own mouse-down handling can move focus back to the canvas.
    const timer = setTimeout(focus);
    return () => clearTimeout(timer);
  }, [editing]);
  useEffect(() => {
    const tr = transformer.current;
    if (!tr) return;
    tr.nodes(selectedNodes());
    tr.getLayer()?.batchDraw();
  }, [showHandles, props.selected, props.shapes]);
  useLayoutEffect(() => {
    const nodes = selectedNodes();
    if (!nodes.length) {
      setToolbarAt(null);
      return;
    }
    const box = union(nodes.map((node) => node.getClientRect()));
    const below = box.y < 70;
    const next = {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(below ? box.y + box.height : box.y),
      below,
    };
    setToolbarAt((old) =>
      old && old.x === next.x && old.y === next.y && old.below === next.below
        ? old
        : next,
    );
  }, [showHandles, props.selected, props.shapes, props.view, size, moving]);
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
    if (props.tool !== 'text' && props.tool !== 'sticky') commitEdit();
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
    const radius = eraserRadius / props.view.scale;
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
        eraserHits(shape, from, to, eraserRadius / props.view.scale, textBounds)
      ) {
        gesture.removed.add(shape.id);
        ids.push(shape.id);
      }
    }
    if (ids.length) props.onErase(ids);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.object-toolbar, .inline-text'))
      return;
    // Any press on the canvas ends text editing before it does anything else.
    pressEndedEdit.current = !!editingRef.current;
    commitEdit();
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
    props.onSelect([]);
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
    // The press that ended a text edit does nothing else.
    if (pressEndedEdit.current) {
      pressEndedEdit.current = false;
      return;
    }
    const p = point();
    if (!p) return;
    if (isEraser(props.tool)) {
      if (event.target === event.target.getStage()) props.onSelect([]);
      return;
    }
    if (props.tool === 'select') {
      if (event.target !== event.target.getStage()) return;
      // Dragging on empty board draws a selection box. Shift adds to the selection.
      const additive =
        event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey;
      if (!additive) props.onSelect([]);
      setMarquee({
        from: p,
        to: p,
        additive,
        base: additive ? props.selected : [],
      });
      return;
    }
    if (props.tool === 'text' || props.tool === 'sticky') {
      // Keep the browser from moving focus back to the canvas after this press.
      event.evt.preventDefault();
      if (props.tool === 'text') {
        const shape = makeShape('text', p.x, p.y, props.color);
        shape.fontSize = Math.round(DEFAULT_TEXT_SIZE / props.view.scale);
        shape.fontSize = clampFontSize(shape.fontSize);
        shape.fontFamily = 'sans';
        shape.y -= (shape.fontSize * 1.35) / 2;
        shape.width = 0;
        beginEdit(shape, true);
      } else {
        const shape = makeShape('sticky', p.x - 102, p.y - 87, '#34483e');
        shape.width = 205;
        shape.height = 175;
        shape.fill = '#f5e7a1';
        shape.fontSize = 16;
        beginEdit(shape, true);
      }
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
    if (kind === 'frame') {
      shape.fill = '#ffffff';
      shape.color = '#d5dccd';
      shape.strokeWidth = 1;
      shape.text = `Frame ${props.shapes.filter((s) => s.kind === 'frame').length + 1}`;
    }
    if (isLine(kind)) shape.points = [0, 0];
    draftRef.current = shape;
    setDraft(shape);
  }
  function move() {
    const p = point();
    if (!p) return;
    props.onCursor(p.x, p.y);
    if (marqueeRef.current) {
      setMarquee({ ...marqueeRef.current, to: p });
      return;
    }
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
          1.5 / props.view.scale
      )
        return;
      next = { ...next, points: [...points, dx, dy] };
    }
    draftRef.current = next;
    setDraft(next);
  }
  function finishMarquee() {
    const box = marqueeRef.current;
    setMarquee(null);
    if (!box) return;
    const area = toScreen(normalise(box.from, box.to));
    if (area.width < 4 && area.height < 4) return;
    const picked = props.shapes
      .filter((shape) => {
        const node = shapeNodes.current.get(shape.id);
        if (!node) return false;
        const bounds = node.getClientRect({ skipShadow: true });
        // Frames are picked only when fully inside, so boxing notes on a frame
        // does not grab the frame as well.
        return shape.kind === 'frame'
          ? contains(area, bounds)
          : intersects(area, bounds);
      })
      .map((shape) => shape.id);
    props.onSelect([
      ...box.base.filter((id) => !picked.includes(id)),
      ...picked.filter((id) => !box.base.includes(id) || !box.additive),
    ]);
  }
  function toScreen(box: Bounds): Bounds {
    return {
      x: box.x * props.view.scale + props.view.x,
      y: box.y * props.view.scale + props.view.y,
      width: box.width * props.view.scale,
      height: box.height * props.view.scale,
    };
  }
  function finish() {
    if (marqueeRef.current) {
      finishMarquee();
      return;
    }
    let shape = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!shape) return;
    if (isLine(shape.kind) && shape.points.length === 2)
      shape = { ...shape, points: [0, 0, 0.1, 0.1] };
    // A plain click with the frame tool places a ready-made frame.
    if (shape.kind === 'frame' && Math.hypot(shape.width, shape.height) < 20)
      shape = {
        ...shape,
        x: shape.x - 240,
        y: shape.y - 160,
        width: 480,
        height: 320,
      };
    if (!isLine(shape.kind) && Math.hypot(shape.width, shape.height) < 3)
      return;
    if (
      shape.kind === 'rect' ||
      shape.kind === 'ellipse' ||
      shape.kind === 'frame'
    )
      shape = {
        ...shape,
        x: shape.x + Math.min(0, shape.width),
        y: shape.y + Math.min(0, shape.height),
        width: Math.abs(shape.width),
        height: Math.abs(shape.height),
      };
    props.onAdd(shape);
    if (shape.kind === 'frame') {
      props.onSelect([shape.id]);
      props.onToolDone();
    }
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
          setMarquee(null);
        }}
        onWheel={zoom}
      >
        <Layer>
          {[
            ...props.shapes.filter((shape) => shape.kind === 'frame'),
            ...props.shapes.filter((shape) => shape.kind !== 'frame'),
          ].map((shape) => (
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
                if (props.tool !== 'select' || panning) return;
                event.cancelBubble = true;
                const chosen = props.selected.includes(shape.id);
                if (
                  event.evt.shiftKey ||
                  event.evt.ctrlKey ||
                  event.evt.metaKey
                )
                  props.onSelect(
                    chosen
                      ? props.selected.filter((id) => id !== shape.id)
                      : [...props.selected, shape.id],
                  );
                // Pressing a selected object keeps the group, so it can be dragged.
                else if (!chosen) props.onSelect([shape.id]);
              }}
              onClick={(event) => {
                // A plain click (no drag) inside a group narrows it to this object.
                const additive =
                  event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey;
                if (
                  props.tool === 'select' &&
                  !additive &&
                  props.selected.length > 1 &&
                  props.selected.includes(shape.id)
                )
                  props.onSelect([shape.id]);
              }}
              onDblClick={() => {
                if (
                  props.tool === 'select' &&
                  (shape.kind === 'text' || shape.kind === 'sticky')
                )
                  beginEdit(shape, false);
              }}
              onDblTap={() => {
                if (
                  props.tool === 'select' &&
                  (shape.kind === 'text' || shape.kind === 'sticky')
                )
                  beginEdit(shape, false);
              }}
              onDragStart={() => {
                setMoving(true);
                // Move the rest of the selection and whatever sits inside the
                // frames being moved.
                const moved = props.selected.includes(shape.id)
                  ? selectedShapes
                  : [shape];
                const ids = new Set([shape.id]);
                const others: BoardShape[] = [];
                for (const item of [
                  ...moved,
                  ...moved.flatMap((item) =>
                    item.kind === 'frame' ? framed(item, props.shapes) : [],
                  ),
                ])
                  if (!ids.has(item.id)) {
                    ids.add(item.id);
                    others.push(item);
                  }
                carry.current = others;
              }}
              onDragMove={(event) => {
                // A frame carries the objects inside it.
                const dx = event.currentTarget.x() - shape.x;
                const dy = event.currentTarget.y() - shape.y;
                for (const inner of carry.current)
                  shapeNodes.current
                    .get(inner.id)
                    ?.position({ x: inner.x + dx, y: inner.y + dy });
              }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                setMoving(false);
                const dx = event.currentTarget.x() - shape.x;
                const dy = event.currentTarget.y() - shape.y;
                props.onMove([
                  {
                    id: shape.id,
                    x: event.currentTarget.x(),
                    y: event.currentTarget.y(),
                  },
                  ...carry.current.map((inner) => ({
                    id: inner.id,
                    x: inner.x + dx,
                    y: inner.y + dy,
                  })),
                ]);
                carry.current = [];
              }}
              onTransformStart={() => setMoving(true)}
              onTransform={(event) => {
                // Side handles reflow text instead of stretching it.
                const anchor = transformer.current?.getActiveAnchor() ?? '';
                if (
                  multiple ||
                  shape.kind !== 'text' ||
                  !SIDES.includes(anchor)
                )
                  return;
                const group = event.currentTarget as Konva.Group;
                const text = group.findOne<Konva.Text>('Text');
                text?.width(Math.max(20, text.width() * group.scaleX()));
                group.scale({ x: 1, y: 1 });
              }}
              onTransformEnd={(event) => {
                setMoving(false);
                const group = event.currentTarget as Konva.Group;
                const sx = group.scaleX();
                const sy = group.scaleY();
                group.scale({ x: 1, y: 1 });
                const anchor = transformer.current?.getActiveAnchor() ?? '';
                props.onUpdate(shape.id, {
                  x: group.x(),
                  y: group.y(),
                  ...resized(shape, group, sx, sy, CORNERS.includes(anchor)),
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
              <ShapeContent
                shape={
                  editing?.shape.id === shape.id
                    ? { ...shape, text: '' }
                    : shape
                }
                scale={props.view.scale}
              />
            </Group>
          ))}
          {editing && !editing.before && editing.shape.kind === 'sticky' && (
            <Group x={editing.shape.x} y={editing.shape.y} listening={false}>
              <ShapeContent
                shape={{ ...editing.shape, text: '' }}
                scale={props.view.scale}
              />
            </Group>
          )}
          <Transformer
            ref={transformer}
            rotateEnabled={false}
            flipEnabled={false}
            ignoreStroke
            padding={4}
            borderStroke="#5f8a3c"
            borderStrokeWidth={1.5}
            keepRatio={
              multiple ||
              selectedShape?.kind === 'text' ||
              selectedShape?.kind === 'image'
            }
            enabledAnchors={
              multiple || selectedShape?.kind === 'image'
                ? CORNERS
                : selectedShape?.kind === 'text'
                  ? [...CORNERS, ...SIDES]
                  : [...CORNERS, ...SIDES, 'top-center', 'bottom-center']
            }
            anchorStyleFunc={(anchor) => {
              const corner = CORNERS.some((name) => anchor.hasName(name));
              const size = corner ? 12 : 9;
              anchor.width(size);
              anchor.height(size);
              anchor.offsetX(size / 2);
              anchor.offsetY(size / 2);
              anchor.cornerRadius(size);
              anchor.fill(corner ? '#ffffff' : '#5f8a3c');
              anchor.stroke(corner ? '#7d8a78' : '#ffffff');
              anchor.strokeWidth(1.5);
            }}
            boundBoxFunc={(oldBox, newBox) =>
              Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 8
                ? oldBox
                : newBox
            }
          />
          {marquee && (
            <Rect
              {...normalise(marquee.from, marquee.to)}
              fill="#5f8a3c14"
              stroke="#5f8a3c"
              strokeWidth={1 / props.view.scale}
              dash={[4 / props.view.scale, 3 / props.view.scale]}
              listening={false}
            />
          )}
          {draft && (
            <Group x={draft.x} y={draft.y} listening={false}>
              <ShapeContent shape={draft} scale={props.view.scale} />
            </Group>
          )}
        </Layer>
        <Layer listening={false}>
          {props.presence.map((person) => (
            <RemoteCursor key={person.id} person={person} />
          ))}
          <Circle x={-100} y={-100} radius={0} />
        </Layer>
      </Stage>
      {editing && (
        <InlineText
          ref={textarea}
          editing={editing}
          view={props.view}
          onChange={(text) =>
            setEditing({ ...editing, shape: { ...editing.shape, text } })
          }
          onCommit={commitEdit}
        />
      )}
      {toolbarAt &&
        selectedShapes.length > 0 &&
        !moving &&
        !editing &&
        !marquee && (
          <div
            ref={(node) => {
              // Keep the toolbar fully inside the canvas.
              if (!node) return;
              const half = node.offsetWidth / 2;
              const left = Math.min(
                Math.max(toolbarAt.x, half + 8),
                Math.max(half + 8, size.width - half - 8),
              );
              node.style.left = `${left}px`;
              const desiredTop = toolbarAt.below
                ? toolbarAt.y + 18
                : toolbarAt.y - node.offsetHeight - 18;
              node.style.top = `${Math.max(8, Math.min(desiredTop, size.height - node.offsetHeight - 8))}px`;
              node.style.transform = 'translateX(-50%)';
            }}
            className={`object-toolbar-anchor${toolbarAt.below ? ' below' : ''}`}
            style={{ left: toolbarAt.x, top: toolbarAt.y }}
          >
            {selectedShape
              ? props.renderToolbar(selectedShape)
              : props.renderGroupToolbar(selectedShapes)}
          </div>
        )}
      {trailPoints.length > 1 && (
        <svg className="eraser-trail" aria-hidden="true">
          <polyline
            points={trailPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#8a8f88"
            strokeOpacity={0.35}
            strokeWidth={eraserRadius * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {isEraser(props.tool) && !panning && eraserCursor && (
        <span
          className={`eraser-cursor${props.tool === 'eraser-partial' ? ' partial' : ''}`}
          aria-hidden="true"
          style={{
            left: eraserCursor.x,
            top: eraserCursor.y,
            width: eraserRadius * 2,
            height: eraserRadius * 2,
          }}
        />
      )}
      {isBrush(props.tool) && !panning && brushCursor && (
        <span
          className="brush-cursor"
          aria-hidden="true"
          style={{
            left: brushCursor.x,
            top: brushCursor.y,
            width: props.width * props.view.scale,
            height: props.width * props.view.scale,
            background: props.color,
            opacity:
              props.tool === 'highlighter' ? HIGHLIGHT_OPACITY + 0.15 : 1,
          }}
        />
      )}
    </div>
  );
}

/** New geometry after a handle drag, given the group's temporary scale. */
function resized(
  shape: BoardShape,
  group: Konva.Group,
  sx: number,
  sy: number,
  corner: boolean,
): Partial<BoardShape> {
  if (shape.kind === 'text') {
    const text = group.findOne<Konva.Text>('Text');
    const width = Math.round(
      (text?.width() ?? shape.width) * (corner ? sx : 1),
    );
    if (!corner) return { width, height: measureText(shape, width).height };
    const fontSize = clampFontSize(textStyle(shape).fontSize * sy);
    const next = { ...shape, fontSize, width };
    return { fontSize, width, height: measureText(next, width).height };
  }
  if (shape.kind === 'stroke' || shape.kind === 'highlight')
    return {
      points: shape.points.map(
        (value, index) =>
          Math.round((index % 2 ? value * sy : value * sx) * 100) / 100,
      ),
    };
  const min =
    shape.kind === 'sticky'
      ? 80
      : shape.kind === 'frame'
        ? 40
        : shape.kind === 'image'
          ? 16
          : 4;
  const sign = (value: number) => (value < 0 ? -1 : 1);
  return {
    width:
      sign(shape.width) * Math.max(min, Math.round(Math.abs(shape.width * sx))),
    height:
      sign(shape.height) *
      Math.max(min, Math.round(Math.abs(shape.height * sy))),
  };
}
