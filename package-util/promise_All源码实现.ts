namespace promise_all {
  // 原方法测试
  // const p1 = Promise.resolve(1);
  // const p2 = new Promise((resolve) => {
  //   setTimeout(() => resolve(2), 1000);
  // });
  // const p3 = new Promise((resolve) => {
  //   setTimeout(() => resolve(3), 3000);
  // });

  // // 1. 所有的Promise都成功了
  // const p11 = Promise.all([p1, p2, p3])
  //   .then(console.log) // [ 1, 2, 3 ]
  //   .catch(console.log);

  // const p4 = Promise.reject('err4');
  // const p5 = Promise.reject('err5');

  // // 2. 有一个Promise失败了
  // const p12 = Promise.all([p1, p2, p4]).then(console.log).catch(console.log); // err4

  // // 3. 有两个Promise失败了，可以看到最终输出的是err4，第一个失败的返回值
  // const p13 = Promise.all([p1, p4, p5]).then(console.log).catch(console.log); // err4

  // 源码实现
  function MyPromiseAll(arr: any) {
    // 非数组报错
    if (typeof arr !== 'object' || arr instanceof Array !== true) {
      throw new Error('object is not iterable')
    }

    return new Promise((resolve, reject) => {
      let count = 0;
      let result = <any>[];
      arr.map((promise: any) => {
        Promise.resolve(promise)
          .then((res: any) => {
            count++;
            result.push(res);
            if (count === arr.length) resolve(result);
          })
          .catch((err: any) => {
            reject(err);
          });
      });
    });
  }

  const p1 = Promise.resolve(1);
  const p2 = new Promise((resolve) => {
    setTimeout(() => resolve(2), 1000);
  });
  const p3 = new Promise((resolve) => {
    setTimeout(() => resolve(3), 3000);
  });

  // 1. 所有的Promise都成功了
  const p11 = MyPromiseAll([p1, p2, p3])
    .then(console.log) // [ 1, 2, 3 ]
    .catch(console.log);

  const p4 = Promise.reject('err4');
  const p5 = Promise.reject('err5');

  // 2. 有一个Promise失败了
  const p12 = MyPromiseAll([p1, p2, p4]).then(console.log).catch(console.log); // err4

  // 3. 有两个Promise失败了，可以看到最终输出的是err4，第一个失败的返回值
  const p13 = Promise.all([p1, p4, p5]).then(console.log).catch(console.log); // err4
}
