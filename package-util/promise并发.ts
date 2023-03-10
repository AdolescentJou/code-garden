namespace promise_class {
  class PromisePoolC {
    length: number;
    fn: Function;
    urls: Array<String>;
    pool: Array<Promise<any>>;
    constructor(length: number, fn: Function) {
      this.length = length;
      this.fn = fn;
      this.urls = [];
      this.pool = [];
    }

    start(urls: Array<String>) {
      this.urls = urls;
      while (this.pool.length < this.length) {
        let url = this.urls.shift() || '';
        this.setTask(url);
      }
      return this.run();
    }

    run() {
      Promise.resolve()
        .then(() => {
          return Promise.race(this.pool);
        })
        .catch((err: any) => {
          console.log(err);
        })
        .then(() => {
          let url = this.urls.shift() || '';
          this.setTask(url);
          this.run();
        });
    }

    setTask(url: String) {
      if (!url) return;
      let task = this.fn(url);
      this.pool.push(task); // 将该任务推入pool并发池中
      console.log(`${url}任务执行开始`);
      task
        .then(() => {
          this.pool.splice(this.pool.indexOf(task), 1);
          console.log(`${url}任务执行结束，执行成功，当前并发数${this.pool.length}`);
        })
        .catch(() => {
          this.pool.splice(this.pool.indexOf(task), 1);
          console.log(`${url}任务执行结束，执行失败`);
        });
    }
  }

  // test
  const URLS = ['bytedance.com', 'tencent.com', 'alibaba.com', 'microsoft.com', 'apple.com', 'hulu.com', 'amazon.com'];
  let len = 0;
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

  const promisePool = new PromisePoolC(2, requestFn);
  promisePool.start(URLS);
}
