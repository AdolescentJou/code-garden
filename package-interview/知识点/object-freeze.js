let obj = {
  age:22
}

obj.age = 23;
console.log(obj);
Object.freeze(obj);
obj.age = 24; // freeze后的对象修改不生效
console.log(obj);