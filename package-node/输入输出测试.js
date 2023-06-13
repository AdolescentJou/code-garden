const readline = require('readline');

// 创建读取行接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

var inputArr = [];
var lineCount = 0;
rl.on('line', (input) => {
  var sum = input.trim().split(' ').reduce((acc, cur) => acc + (+cur), 0)
  inputArr.push(sum);
  lineCount++;
  if (lineCount === 2) {
    lineCount = 0;
    for (var item of inputArr) {
      // 打印出结果
      console.log(item);
    }
    //重新计算读取行和结果数据
    lineCount = 0;
    inputArr = [];
  }
})