import { useLayoutEffect, type RefObject } from 'react';
import type Konva from 'konva';

/** Browser zoom and moving between monitors can change DPR without a reload. */
export function useCanvasDensity(stage: RefObject<Konva.Stage | null>) {
  useLayoutEffect(() => {
    let query: MediaQueryList;
    const refresh = () => {
      const ratio = window.devicePixelRatio || 1;
      for (const layer of stage.current?.getLayers() ?? []) {
        const canvas = layer.getCanvas();
        if (canvas.getPixelRatio() !== ratio) {
          canvas.setPixelRatio(ratio);
          layer.draw();
        }
      }
      query?.removeEventListener('change', refresh);
      query = matchMedia(`(resolution: ${ratio}dppx)`);
      query.addEventListener('change', refresh);
    };
    refresh();
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    return () => {
      query.removeEventListener('change', refresh);
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, [stage]);
}
