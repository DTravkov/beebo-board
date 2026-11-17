import { useLayoutEffect, useRef } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { Presence } from '../../lib/room';

export function RemoteCursor({ person }: { person: Presence }) {
  const group = useRef<Konva.Group>(null);
  const initialPosition = useRef({ x: person.x, y: person.y });
  const lastUpdate = useRef(person.updated);

  useLayoutEffect(() => {
    const node = group.current;
    if (!node) return;
    // Match normal and low-bandwidth arrival intervals, but never trail a
    // returning cursor for the entire time its owner was idle.
    const duration = Math.min(
      200,
      Math.max(70, person.updated - lastUpdate.current),
    );
    lastUpdate.current = person.updated;
    const from = node.position();
    if (from.x === person.x && from.y === person.y) return;
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - started) / duration));
      node.position({
        x: from.x + (person.x - from.x) * progress,
        y: from.y + (person.y - from.y) * progress,
      });
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    // Retarget from the displayed position; stop animating when a peer leaves.
    return () => cancelAnimationFrame(frame);
  }, [person.x, person.y, person.updated]);

  return (
    <Group
      ref={group}
      name="remote-cursor"
      x={initialPosition.current.x}
      y={initialPosition.current.y}
      listening={false}
    >
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
      <Text text={person.name} x={21} y={25} fontSize={12} fill="#ffffff" />
    </Group>
  );
}
