namespace Promise_resolve {
  const myResolve = function (value?: any) {
    if (value && typeof value === 'object' && value instanceof Promise) {
      return value;
    }
    return new Promise(function (resolve, reject) {
      resolve(value);
    });
  };

  // 测试一下，还是用刚才的例子
  // 1. 非Promise对象，非thenable对象
  myResolve(1).then(console.log); // 1

  // 2. Promise对象成功状态
  const p2 = new Promise((resolve) => resolve(2));

  myResolve(p2).then(console.log); // 2

  // 3. Promise对象失败状态
  const p3 = new Promise((_, reject) => reject('err3'));

  myResolve(p3).catch(console.error); // err3

  // 4. thenable对象
  const p4 = {
    then(resolve: any) {
      setTimeout(() => resolve(4), 1000);
    },
  };
  myResolve(p4).then(console.log); // 4

  // 5. 啥都没传
  myResolve().then(console.log); // undefined
}
