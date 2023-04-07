// Promise.resolve()
//   .then(() => {
//     console.log(0);
//     return Promise.resolve(4);
//   })
//   .then((res) => {
//     console.log(res);
//   });

// 相当于
Promise.resolve()
  .then(() => {
    console.log(0);
  })
  .then(() => {})
  .then(() => {
    return 4;
  })
  .then((res) => {
    console.log(res);
  });

// Js引擎为了让microtask尽快的输出，做了一些优化，
// 连续的多个then(3个)如果没有reject或者resolve会交替执行then而不至于让一个堵太久完成用户无响应，
// 不单单v8这样其他引擎也是这样，因为其实promise内部状态已经结束了。
// 这块在v8源码里有完整的体现
Promise.resolve()
  .then(() => {
    console.log(1);
  })
  .then(() => {
    console.log(2);
  })
  .then(() => {
    console.log(3);
  })
  .then(() => {
    console.log(5);
  })
  .then(() => {
    console.log(6);
  });

// Promise.resolve().then(() => {
//   console.log('a');
// }).then(() => {
//   console.log('b');
// })
// .then(() => {
//   console.log('c');
// }).then(() => {
//   console.log('d');
// }).then(() =>{
//   console.log('e');
// })
