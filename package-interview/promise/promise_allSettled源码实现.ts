namespace promise_allSettled {
  // 使用
  // const p1 = Promise.resolve('p1');
  // const p2 = new Promise((resolve, reject) => {
  //   setTimeout(() => {
  //     resolve('p2 延时一秒');
  //   }, 1000);
  // });
  // const p3 = new Promise((resolve, reject) => {
  //   setTimeout(() => {
  //     resolve('p3 延时两秒');
  //   }, 2000);
  // });

  // const p4 = Promise.reject('p4 rejected');

  // const p5 = new Promise((resolve, reject) => {
  //   setTimeout(() => {
  //     reject('p5 rejected 延时1.5秒');
  //   }, 1500);
  // });

  // // 所有 Promise 实例都成功
  // Promise.allSettled([p1, p2, p3])
  //   .then((res) => console.log(res))
  //   .catch((err) => console.log(err));
  // // [
  // //   { status: 'fulfilled', value: 'p1' },
  // //   { status: 'fulfilled', value: 'p2 延时一秒' },
  // //   { status: 'fulfilled', value: 'p3 延时两秒' }
  // // ]

  // // 有一个 Promise 失败
  // Promise.allSettled([p1, p2, p4])
  //   .then((res) => console.log(res))
  //   .catch((err) => console.log(err));
  // // [
  // //   { status: 'fulfilled', value: 'p1' },
  // //   { status: 'fulfilled', value: 'p2 延时一秒' },
  // //   { status: 'rejected' , value: 'p4 rejected' }
  // // ]

  // // 所有 Promise 都失败
  // Promise.allSettled([p4, p5])
  //   .then((res) => console.log(res))
  //   .catch((err) => console.log(err));
  // // [
  // //   { status: 'rejected', reason: 'p4 rejected' },
  // //   { status: 'rejected', reason: 'p5 rejected 延时1.5秒' }
  // // ]

  // 实现
  function MyAllSettled(promises: any) {
    let arr = <any>[],
      count = 0;
    return new Promise((resolve, reject) => {
      promises.forEach((item: any, i: any) => {
        Promise.resolve(item).then(
          (res) => {
            arr[i] = { status: 'fulfilled', val: res };
            count += 1;
            if (count === promises.length) resolve(arr);
          },
          (err) => {
            arr[i] = { status: 'rejected', val: err };
            count += 1;
            if (count === promises.length) resolve(arr);
          },
        );
      });
    });
  }

  const p1 = Promise.resolve('p1');
  const p2 = new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('p2 延时一秒');
    }, 1000);
  });
  const p3 = new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('p3 延时两秒');
    }, 2000);
  });

  const p4 = Promise.reject('p4 rejected');

  const p5 = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject('p5 rejected 延时1.5秒');
    }, 1500);
  });

  // 所有 Promise 实例都成功
  MyAllSettled([p1, p2, p3])
    .then((res) => console.log(res))
    .catch((err) => console.log(err));
  // [
  //   { status: 'fulfilled', value: 'p1' },
  //   { status: 'fulfilled', value: 'p2 延时一秒' },
  //   { status: 'fulfilled', value: 'p3 延时两秒' }
  // ]

  // 有一个 Promise 失败
  MyAllSettled([p1, p2, p4])
    .then((res) => console.log(res))
    .catch((err) => console.log(err));
  // [
  //   { status: 'fulfilled', value: 'p1' },
  //   { status: 'fulfilled', value: 'p2 延时一秒' },
  //   { status: 'rejected' , value: 'p4 rejected' }
  // ]

  // 所有 Promise 都失败
  MyAllSettled([p4, p5])
    .then((res) => console.log(res))
    .catch((err) => console.log(err));
  // [
  //   { status: 'rejected', reason: 'p4 rejected' },
  //   { status: 'rejected', reason: 'p5 rejected 延时1.5秒' }
  // ]
}
