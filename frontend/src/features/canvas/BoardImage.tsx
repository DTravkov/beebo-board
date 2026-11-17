import { useEffect, useState } from 'react';
import { Image as KonvaImage, Rect } from 'react-konva';
import type { BoardShape } from '../../shared/board';

// Decoded pictures, shared by every render of the same image data.
const decoded = new Map<string, HTMLImageElement>();
export function BoardImage({ shape }: { shape: BoardShape }) {
  const src = shape.src ?? '';
  const [image, setImage] = useState(() => {
    const cached = decoded.get(src);
    return cached?.complete ? cached : null;
  });
  useEffect(() => {
    let cached = decoded.get(src);
    if (cached?.complete) {
      setImage(cached);
      return;
    }
    if (!cached) {
      cached = new window.Image();
      cached.src = src;
      if (decoded.size > 200) decoded.clear();
      decoded.set(src, cached);
    }
    const element = cached;
    let live = true;
    element
      .decode()
      .then(() => live && setImage(element))
      .catch(() => live && setImage(null));
    return () => {
      live = false;
    };
  }, [src]);
  if (!image)
    return (
      <Rect
        width={shape.width}
        height={shape.height}
        fill="#eef2ea"
        stroke="#d5dccd"
        strokeWidth={1}
      />
    );
  return <KonvaImage image={image} width={shape.width} height={shape.height} />;
}
