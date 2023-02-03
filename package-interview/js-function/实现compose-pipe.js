
//给定一个输入值x，先给这个值加10，然后结果乘以10
const add = (x) => x + 10;
const multiply = (x) => x * 10;


const compose = (...args) => {
  const arr = args.slice();
  return function (x) {
    return arr.reduceRight((pre, next) => next(pre), x);
  };
};

const pipe = (...args) => {
  const arr = args.slice();
  return function (x) {
    return arr.reduce((pre, next) => next(pre), x);
  };
};

let res = compose(multiply, add)(10);
let res2 = pipe(add, multiply)(10);
console.log(res);
console.log(res2);