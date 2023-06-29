import { useCallback, useEffect, useRef, useState } from 'react';

const compatibleTouch = (e: any) => {
  if (e.type === 'touchstart' || e.type === 'touchmove') {
    if (e.targetTouches && e.targetTouches.length) {
      const touch = e.targetTouches[0];
      return {
        clientX: touch.clientX,
        clientY: touch.clientY,
        isDrag: false,
      };
    }
  }
  if (e.type === 'mousedown' || e.type === 'mousemove') {
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      isDrag: false,
    };
  }
  if (e.type === 'dragstart' || e.type === 'drag') {
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      isDrag: true,
    };
  }
  return {
    clientX: 0,
    clientY: 0,
    isDrag: false,
  };
};

const useTouch = function (
  type: 'mouse' | 'drag' | 'touch',
  scrollNode?: HTMLDivElement,
  scroll?: (...args: any[]) => void,
) {
  const touchRef = useRef<any>({
    isStarted: false,
  });

  const startHandle = useCallback(
    (e: any) => {
      e.preventDefault();
      touchRef.current.isStarted = true;

      const { clientX, clientY } = compatibleTouch(e);
      if (typeof scroll === 'function') {
        scroll('start', clientX, clientY);
      }
    },
    [scroll],
  );
  const moveHandle = useCallback(
    (e: any) => {
      e.preventDefault();
      if (!touchRef.current.isStarted) {
        return;
      }

      const { clientX, clientY } = compatibleTouch(e);

      requestAnimationFrame(() => {
        if (typeof scroll === 'function') {
          scroll('move', clientX, clientY);
        }
      });
    },
    [scroll],
  );
  const endHandle = useCallback(
    (e: any) => {
      e.preventDefault();

      if (!touchRef.current.isStarted) return;
      touchRef.current.isStarted = false;
      requestAnimationFrame(() => {
        if (typeof scroll === 'function') {
          scroll('end');
        }
      });
    },
    [scroll],
  );

  useEffect(() => {
    if (!scrollNode || !scrollNode) {
      return;
    }
    const nodeElement = scrollNode as HTMLDivElement;
    if (type === 'mouse') {
      const outEventName = 'mouseleave';
      nodeElement.addEventListener('mousedown', startHandle, false);
      nodeElement.addEventListener('mousemove', moveHandle, false);
      nodeElement.addEventListener('mouseup', endHandle, false);
      nodeElement.addEventListener('mouseupcancel', endHandle, false);
      nodeElement.addEventListener('mouseout', endHandle, false);
    }
    if (type === 'drag') {
      nodeElement.addEventListener('dragstart', startHandle, false);
      nodeElement.addEventListener('drag', moveHandle, false);
      nodeElement.addEventListener('dragend', endHandle, false);
    }
    if (type === 'touch') {
      nodeElement.addEventListener('touchstart', startHandle, false);
      nodeElement.addEventListener('touchmove', moveHandle, false);
      nodeElement.addEventListener('touchend', endHandle, false);
      nodeElement.addEventListener('touchcancel', endHandle, false);
    }
    return () => {
      if (type === 'mouse') {
        const outEventName = 'mouseleave';
        nodeElement.removeEventListener('mousedown', startHandle, false);
        nodeElement.removeEventListener('mousemove', moveHandle, false);
        nodeElement.removeEventListener('mouseup', endHandle, false);
        nodeElement.removeEventListener('mouseupcancel', endHandle, false);
        nodeElement.removeEventListener('mouseout', endHandle, false);
      }
      if (type === 'drag') {
        nodeElement.removeEventListener('dragstart', startHandle, false);
        nodeElement.removeEventListener('drag', moveHandle, false);
        nodeElement.removeEventListener('dragend', endHandle, false);
      }
      if (type === 'touch') {
        nodeElement.removeEventListener('touchstart', startHandle, false);
        nodeElement.removeEventListener('touchmove', moveHandle, false);
        nodeElement.removeEventListener('touchend', endHandle, false);
        nodeElement.removeEventListener('touchcancel', endHandle, false);
      }
    };
  }, [endHandle, moveHandle, scrollNode, startHandle, type]);
};

export default useTouch;
