var path = require('path');

//resolve表示拼接路径，它会把传入的各个参数拼接到一起
//路径顺序是从右往左，将路径拼接到一起，遇到绝对路径停止 /
//__dirname是全局变量，表示根路径
const a = path.resolve(__dirname, '/main','./src', './index.js');
console.log(a);
// d:\main\src\index.js

const b = path.resolve(__dirname, './main','src', './index.js');
console.log(b);
// d:\test\nodejs\main\src\index.js

// 按照相对路径拼接路径
const c = path.join(__dirname, './main','./src', './index.js');
console.log(c);

const d = path.join(__dirname, '/main','/src', '/index.js');
console.log(d);

// 判断是否是绝对路径
console.log(path.isAbsolute(d));
console.log(path.isAbsolute('./index.js'));

// 用于将绝对路径转为相对路径，返回从 from 到 to 的相对路径（基于当前工作目录）。
const e = path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb');
console.log(e);
// 返回: '../../impl/bbb'