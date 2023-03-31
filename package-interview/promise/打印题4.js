async function a1() {
  console.log('1');
  await a2();
  console.log('2');
}
async function a2() {
  console.log('3');
}
console.log('4');
setTimeout(() => {
  console.log('5');
}, 0);
Promise.resolve().then(() => {
  console.log('6');
});
a1();
let promise2 = new Promise((resolve) => {
  resolve('7');
  console.log('8');
});
promise2.then((res) => {
  console.log(res);
  Promise.resolve().then(() => {
    console.log('9');
  });
});
console.log('10');

// 