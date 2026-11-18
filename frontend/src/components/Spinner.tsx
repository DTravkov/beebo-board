import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from './Icon';
import { Stage, Layer, Group } from 'react-konva';
import type Konva from 'konva';
import type { BoardShape } from '../shared/board';
import { ShapeContent } from '../features/canvas/ShapeContent';
import { useCanvasDensity } from '../features/canvas/useCanvasDensity';

export type SpinnerPreview = {
  width: number;
  height: number;
  gridSize: number;
  gridX: number;
  gridY: number;
  scale: number;
  centerX: number;
  centerY: number;
};

/** Only the content rotates; the local view never changes document coordinates. */
export function Spinner({
  preview,
  shapes,
  onClose,
}: {
  preview: SpinnerPreview;
  shapes: BoardShape[];
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<Konva.Group>(null);
  const stage = useRef<Konva.Stage>(null);
  useCanvasDensity(stage);
  const handle = useRef<HTMLButtonElement>(null);
  const motion = useRef({ angle: 0, target: 0, velocity: 0 });
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const reduced = useRef(false);
  const zoom = useRef({ current: 1, target: 1 });
  const [zoomTarget, setZoomTarget] = useState(1);
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      drag.current = null;
      motion.current.velocity = 0;
    });
    observer.observe(element);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reduced.current = preference.matches;
      motion.current.velocity = 0;
    };
    update();
    preference.addEventListener('change', update);
    handle.current?.focus({ preventScroll: true });
    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const value = motion.current;
      if (document.hidden) {
        value.velocity = 0;
        drag.current = null;
      }
      if (!drag.current) {
        value.target += value.velocity * dt;
        value.velocity *= Math.exp(-0.38 * dt);
        if (Math.abs(value.velocity) < 0.002) value.velocity = 0;
      }
      value.angle +=
        (value.target - value.angle) *
        (reduced.current ? 1 : 1 - Math.exp(-22 * dt));
      zoom.current.current +=
        (zoom.current.target - zoom.current.current) *
        (reduced.current ? 1 : 1 - Math.exp(-18 * dt));
      if (content.current) {
        content.current.rotation((value.angle * 180 * 1.2) / Math.PI);
        const scale = preview.scale * zoom.current.current;
        content.current.scale({ x: scale, y: scale });
        content.current.getLayer()?.batchDraw();
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const stop = () => {
      drag.current = null;
      motion.current.velocity = 0;
      motion.current.target = motion.current.angle;
    };
    window.addEventListener('blur', stop);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const units =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      const delta = Math.max(-400, Math.min(400, event.deltaY * units));
      zoom.current.target = Math.max(
        0.1,
        Math.min(8, zoom.current.target * Math.exp(-delta * 0.002)),
      );
      setZoomTarget(zoom.current.target);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      preference.removeEventListener('change', update);
      window.removeEventListener('blur', stop);
      element.removeEventListener('wheel', wheel);
    };
  }, []);

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    motion.current.velocity = 0;
    motion.current.target = motion.current.angle;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const held = drag.current;
    if (!held || held.pointer !== event.pointerId) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    // A simple pull in either direction spins the board; no circular gesture needed.
    const delta = (Math.abs(dx) >= Math.abs(dy) ? dx : -dy) * 0.012;
    const now = performance.now();
    const dt = Math.max((now - held.time) / 1000, 1 / 240);
    const value = motion.current;
    const speed = Math.max(-12, Math.min(12, delta / dt));
    value.velocity += (speed - value.velocity) * (1 - Math.exp(-18 * dt));
    value.target += delta;
    held.x = event.clientX;
    held.y = event.clientY;
    held.time = now;
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    const held = drag.current;
    if (!held || held.pointer !== event.pointerId) return;
    if (
      reduced.current ||
      performance.now() - held.time > 100 ||
      event.type !== 'pointerup'
    )
      motion.current.velocity = 0;
    drag.current = null;
  }

  return (
    <div
      ref={host}
      className="spinner-mode"
      role="region"
      aria-label="Spinner break"
      style={{
        backgroundSize: `${preview.gridSize}px ${preview.gridSize}px`,
        backgroundPosition: `${preview.gridX}px ${preview.gridY}px`,
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="spinner-heading">
        <span>
          <Icon name="spinner" size={18} /> A little pause
        </span>
        <button onClick={onClose}>
          <Icon name="close" size={16} /> Back to board <kbd>Esc</kbd>
        </button>
      </div>
      <div className="spinner-content" aria-hidden="true">
        <Stage
          ref={stage}
          width={size.width}
          height={size.height}
          listening={false}
        >
          <Layer listening={false}>
            <Group
              ref={content}
              name="spinner-content"
              x={size.width / 2}
              y={size.height / 2}
              offsetX={preview.centerX}
              offsetY={preview.centerY}
            >
              {[
                ...shapes.filter((shape) => shape.kind === 'frame'),
                ...shapes.filter((shape) => shape.kind !== 'frame'),
              ].map((shape) => (
                <Group key={shape.id} x={shape.x} y={shape.y}>
                  <ShapeContent
                    shape={shape}
                    scale={preview.scale * zoomTarget}
                  />
                </Group>
              ))}
            </Group>
          </Layer>
        </Stage>
      </div>
      <button
        ref={handle}
        className="spinner-gesture-zone"
        aria-label="Spin board: drag anywhere or use left and right arrow keys"
        aria-describedby="spinner-instructions"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            const value = motion.current;
            if (event.key === ' ') {
              value.velocity = 0;
              value.target = value.angle;
            } else if (reduced.current) {
              value.target += event.key === 'ArrowRight' ? 0.2 : -0.2;
            } else value.velocity = event.key === 'ArrowRight' ? 4 : -4;
          }
        }}
      />
      <p id="spinner-instructions" className="spinner-instructions">
        Drag anywhere to spin. Let your thoughts unwind.
        <span>Wheel to zoom · ← → to spin · Space to stop</span>
        <output aria-label="Spinner zoom">
          {Math.round(preview.scale * zoomTarget * 100)}%
        </output>
      </p>
    </div>
  );
}
