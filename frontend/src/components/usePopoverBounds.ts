import { useLayoutEffect, type RefObject } from 'react';

/** Keep a floating editor inside the visible board, including after resizing. */
export function usePopoverBounds(
  ref: RefObject<HTMLDivElement | null>,
  open: boolean,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const update = () => {
      const area = element.closest('.board-area')?.getBoundingClientRect();
      const left = Math.max(0, area?.left ?? 0) + 8;
      const top = Math.max(0, area?.top ?? 0) + 8;
      const right = Math.min(innerWidth, area?.right ?? innerWidth) - 8;
      const bottom = Math.min(innerHeight, area?.bottom ?? innerHeight) - 8;
      element.style.maxWidth = `${Math.max(0, right - left)}px`;
      element.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      element.style.translate = '0px 0px';
      const rect = element.getBoundingClientRect();
      const x = Math.max(left - rect.left, Math.min(0, right - rect.right));
      const y = Math.max(top - rect.top, Math.min(0, bottom - rect.bottom));
      element.style.translate = `${x}px ${y}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, open]);
}
