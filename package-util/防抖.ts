/*
  编写方法实现debounce

  尽可能的去优化它
*/

function debounce(fn: { (): void; apply?: any }, delay: number | undefined) {
  let timer: number | undefined;
  const _ = this;
  return function (_: any, ...args: any) {
    let that = this;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn.apply(that, args);
    }, delay);
  };
}

function test() {
  console.log('方法开始执行');
}

const debounceTest = debounce(test, 3000);
