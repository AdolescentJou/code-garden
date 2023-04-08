Promise.prototype.finally = function (cb) {
  return this.then(
    (data) => {
      // 如何保证Promise.then能够执行完毕
      // 使用this.then 将在前面接收到的值继续向后传递 相当于先.then
      // Promise.resolve 目的是等待cb()后的Promise执行完成
      return Promise.resolve(cb()).then((n) => data);
    },
    (err) => {
      return Promise.resolve(cb()).then((n) => {
        throw err;
      });
    },
  );
};

const x = await new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve(1);
  }, 3000);
}).then((res) => {
  console.log('res1', res);
  return 3;
})
.catch((res) => {
  console.log('res1', res);
  return 4;
}).finally(() => {
  console.log('finally');
}).then(res => {
  console.log('res2',res);
});
