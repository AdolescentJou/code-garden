const p1 = new Promise((resolve, reject) => {
  reject(0);
});
console.log(1);
setTimeout(() => {
  p1.then(undefined, console.log);
}, 0);
console.log(2);
// 1
// 2
// 输出报错 UnhandledPromiseRejection: This error originated either

const p2 = new Promise((resolve, reject) => {
  reject(0);
});
console.log(1);
p2.then(undefined, console.log);
console.log(2);
// 1
// 2
// 0
