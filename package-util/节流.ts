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

// 节流，普通版
function throttle(handler, wait) {
  wait = wait || 300;
  var lastTime = 0;
  return function () {
    var _self = this,
      _args = arguments;
    var nowTime = new Date().getTime();
    if (nowTime - lastTime > wait) {
      handler.apply(_self, _args);
      lastTime = nowTime;
    }
  };
}

// 节流，复杂版（定时器版）
function throttleW(fn, interval, context, firstTime) {
  let timer;
  firstTime = typeof firstTime !== 'undefined' ? firstTime : true;
  return function () {
    let args = arguments;
    let __me = this;
    if (typeof context !== 'undefined') {
      __me = context;
    }
    if (firstTime) {
      fn.apply(__me, args);
      return (firstTime = false);
    }
    if (timer) {
      return false;
    }
    timer = setTimeout(function () {
      clearTimeout(timer);
      timer = null;
      fn.apply(__me, args);
    }, interval);
  };
}
