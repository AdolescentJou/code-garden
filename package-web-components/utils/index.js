const raf = window.requestAnimationFrame.bind(window);
// 一般浏览器的刷新频率为每秒60次，基本为 1/60*1000 = 16.7ms
export function nextFrame(fn) {
  raf(() => {
    raf(fn);
  });
}