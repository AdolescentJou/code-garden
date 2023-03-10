namespace promise_reduce{
  // test
  const URLS = ['bytedance.com', 'tencent.com', 'alibaba.com', 'microsoft.com', 'apple.com', 'hulu.com', 'amazon.com'];
  // 自定义请求函数
  const requestFn = (url: string) => {
    return new Promise((resolve, reject) => {
      setTimeout((_) => {
        if (url === 'microsoft.com') reject('执行microsoft.com遇到了点问题');
        resolve(`任务 ${url} 完成`);
      }, 1000);
    }).then((res) => {
      console.log('外部逻辑 ', res);
    });
  };
  let pool = <any>[];
  let max = 3;

  async function run() {
    for (let i = 0; i < URLS.length; i++) {
      let promise = requestFn(URLS[i]) as any;
      promise
        .then((res: any) => {
          console.log(`${URLS[i]}的请求已经处理完毕,当前并发为${pool.length}`);
        })
        .catch(() => {
          console.log(`${URLS[i]}的请求失败`);
        })
        .then(() => {
          pool.splice(pool.indexOf(promise), 1);
        });
      console.log(`开始处理${URLS[i]}的请求`);
      pool.push(promise);
      
      //这里是重点，当满了就阻塞
      if (pool.length == max) {
        await Promise.race(pool);
      }
    }
  }
  run();
}