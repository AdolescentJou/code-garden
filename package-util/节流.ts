/**
 * 节流 初始和结束都执行
 * @param {Function} fn
 * @param {number} wait
 * @returns {Function}
 */
 export function throttleWithStartAndEnd(fn: Function, wait: number): Function {
  let timer: any = null;
  let startTime = Date.now();
  return function (this: any, ...args) {
    const curTime = Date.now();
    const remainTime = wait - (curTime - startTime);
    const ctx: any = this;
    clearTimeout(timer);
    if (remainTime <= 0) {
      fn.apply(ctx, args);
      startTime = Date.now();
    } else {
      timer = setTimeout(() => {
        fn.apply(ctx, args);
        startTime = Date.now();
      }, remainTime);
    }
  };
}
