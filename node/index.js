const express = require('express');
const http = require('http');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = 3002;

app.use(cors()); // 使用 CORS 中间件允许跨域请求
app.use(express.json());

app.all('/local/conversation/v2/openapi', async (req, res) => {
  try {
    // 使用 axios 发送请求到目标接口
    // const response = await axios({
    //   method: req.method,
    //   url: 'https://aigc.sankuai.com/conversation/v2/openapi',
    //   data: {
    //     ...req.body,
    //     token: req.headers.cookie,
    //   },
    //   headers: req.headers,
    // });
    // 将目标接口的响应转发给浏览器
    res.status(200).send({
      code: 0,
      data: req.headers.cookie,
    });
  } catch (error) {
    console.log('error', error);

    // 处理错误，将错误信息发送给浏览器
    res.status(500).send({ error: 'Failed to forward request' });
  }
});

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
