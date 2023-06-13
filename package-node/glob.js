// https://github.com/isaacs/node-glob


var glob = require('glob');

//获取js目录下的所有js文件.(不包括以'.'开头的文件)
glob('js/*.js', function (er, files) {
  console.log(files);
});

//获取js所有层级目录下的js文件 /** 代表不管多少层的所有层级
glob('js/**/*.js', function (er, files) {
  console.log(files);
});

//glob.sync(pattern, [options])
//同步获取所有的目录
var files = glob.sync('js/**/*.js');
console.log(files);
