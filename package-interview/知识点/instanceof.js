// console.log('aa' instanceof String)   // false
// let obj_string = new String('aa');
// console.log(obj_string instanceof String) // true

// 大家伙们都属于object
// console.log({} instanceof Object) // true
// console.log([] instanceof Array) // true
// console.log([] instanceof Object) // true
// console.log(function() {} instanceof Function) // true
// console.log(function() {} instanceof Object) // true

// function Foo(){} 
// function BFoo(){} 
// Foo.prototype = new BFoo();//JavaScript 原型继承
// let foo = new Foo();
// console.log(foo instanceof Foo); // true
// console.log(foo instanceof BFoo); // true

console.log(String instanceof String); 
console.log(Object instanceof Object); 
console.log(Function instanceof Function); 
console.log(Function instanceof Object);

function Foo(){} 
function BFoo(){} 
Foo.prototype = new BFoo();
console.log(Foo instanceof Function);
console.log(Foo instanceof Foo);
console.log(Foo.__proto__);
console.log(Foo.prototype);