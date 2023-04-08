namespace promise_asnyc {
  // test
  const URLS = ['bytedance.com', 'tencent.com', 'alibaba.com', 'microsoft.com', 'apple.com', 'hulu.com', 'amazon.com'];
  // 自定义请求函数
  const requestFn = (url: string) => {
    console.log(`任务${url}开始`);
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
    for (let i = 0; i < max; i++) {
      let promise = requestFn(URLS[i])
        .then(() => {
          return i;
        })
        .catch(() => {
          return i;
        });
      pool.push(promise);
    }
    await URLS.reduce((prevPromise, curPromise, currentIndex) => {
      return prevPromise
        .then(() => {
          return Promise.race(pool);
        })
        .catch((err) => {
          // 防止中断整个链式调用
          console.error(err);
        })
        .then((res) => {
          pool[res] = requestFn(URLS[currentIndex])
            .then(() => {
              return res;
            })
            .catch((err) => {
              return res;
            });
        });
    }, Promise.resolve());
  }
  run();
}
