setTimeout(function () {
  console.log(1);
}, 100);

new Promise(function (resolve) {
  console.log(2);
  resolve();
  console.log(3); // 这里的代码也会同步执行
}).then(function () {
  console.log(4);
  new Promise((resove, reject) => {
    console.log(5);
    setTimeout(() => {
      console.log(6); // 这里和 1 的打印次序，取决于等待时间的长度
    }, 100);
  });
});
console.log(7);
console.log(8);

// 2 3 7 8 4  5 6 1
// 