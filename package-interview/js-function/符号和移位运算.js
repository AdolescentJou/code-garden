let a = 11; 
console.log(a.toString(2));   // 01011
console.log(a >> 1); // 5     // 正数有符号右移
console.log(a >>> 1); // 5     // 正数无符号右移

let b = -11;  // 1011  0100 0101 11110101 11111010   11111001  100000110 -6
console.log(b.toString(2));
console.log(b >> 1); // -6     // 负数有符号右移
