var var1 = 10;
var var3 = 55;
(() => {
  var3 = 35; // 变量提升，这里赋值的是第三行的var3变量
  console.log(var3); // 35
  var var3 = 45;
  console.log(var3);
  var2 = 15;
  console.log(var1);
})();
console.log(var2);
var var1 = 30;
console.log(var1);
