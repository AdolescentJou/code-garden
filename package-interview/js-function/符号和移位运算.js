// let a = 11;
// console.log(a.toString(2));   // 01011
// console.log(a >> 1); // 5     // 正数有符号右移
// console.log(a >>> 1); // 5     // 正数无符号右移

let b = -11;  // -1011  -6 
console.log(b.toString(2));
console.log(b >> 1); // -6     // 负数有符号右移 直接在-1011的基础上进行向右移动
console.log(b >>> 1); // 2147483642    // 负数无符号右移，需要先转化为补码，再进行移动

// 按位与
// let c1 = 12; // 1100
// let c2 = 9; // 1001
// console.log(c1 & c2); // 8:1000 
// let c3 = 12; // 00001100
// let c4 = -9; // 11110111
// console.log(c3 & c4); // 4:00000100

// 按位或
// let a = 5; // 0101
// let b = 3; // 0011
// let result = a | b; // 0111
// console.log(result); // 7

// let a2 = -5; // 11111111111111111111111111111011 (32-bit two's complement representation)
// let b2 = 3; // 00000000000000000000000000000011 (32-bit two's complement representation)
// let result2 = a2 | b2; // 11111111111111111111111111111011 (32-bit two's complement representation)
// console.log(result2); // -5

// 按位异或
// let a = 5; // 0101
// let b = 3; // 0011
// let result = a ^ b; // 0110
// console.log(result); // 6

// let a2 = -5; // 11111111111111111111111111111011 (32-bit two's complement representation)
// let b2 = 3; // 00000000000000000000000000000011 (32-bit two's complement representation)
// let result2 = a2 ^ b2; // 11111111111111111111111111111000 (32-bit two's complement representation)
// console.log(result2); // -8

// 按位非
// let a = 5; // 0101
// let result = ~a; // 1010
// console.log(result); // -6

// let a2 = -5; // 11111111111111111111111111111011 (32-bit two's complement representation)
// let result2 = ~a; // 00000000000000000000000000000100 (32-bit two's complement representation)
// console.log(result2); // 4