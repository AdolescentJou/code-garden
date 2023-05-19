const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve('./');

// 开启服务
http.createServer(function (req, res) {
  const url = req.url;
  const file = root + url;
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHeader(404, {
        'content-type': 'text/html;charset="utf-8"'
      });
      res.write('<h1>404错误</h1><p>你要找的页面不存在</p>');
      res.end();
    } else if(url.endsWith('.js')) {
      res.writeHeader(200, {
        'content-type': 'text/javascript;charset="utf-8"'
      });
      res.write(data);
      res.end();
    } else if(url.endsWith('.css')) {
      res.writeHeader(200, {
        'content-type': 'text/css;charset="utf-8"'
      });
      res.write(data);
      res.end();
    } else if(url.endsWith('.svg')) {
      res.writeHeader(200, {
        'content-type': 'image/svg+xml'
      });
      res.write(data);
      res.end();
    } else {
      res.writeHeader(200, {
        'content-type': 'charset="utf-8"'
      });
      // 将index.html显示在客户端
      res.write(data);
      res.end();
    }
  })
}).listen(8888); // 端口号
console.log('服务器开启成功: http://localhost:8888/src/index.html');