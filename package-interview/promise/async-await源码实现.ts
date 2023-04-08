namespace async_await {
  // 使用第一次的结果作为第二次的参数
  // function request(num: number):Promise<number> {
  //   return new Promise((resolve, reject) => {
  //     setTimeout(() => {
  //       resolve(num * 10);
  //     }, 1000);
  //   });
  // }

  // async function fn() {
  //   const res1 = await request(1);
  //   console.log(res1);

  //   const res2 = await request(res1);
  //   console.log(res2);
  // }

  // fn();

  // 使用生成器模拟await
  // function request(num: number): Promise<number> {
  //   return new Promise((resolve, reject) => {
  //     setTimeout(() => {
  //       resolve(num * 10);
  //     }, 1000);
  //   });
  // }

  // function* gen(num: number): Generator<Promise<number>> {
  //   const num1: any = yield request(num);
  //   const num2: any = yield request(num1);
  //   const num3 = yield request(num2);
  //   return 4;
  // }
  // const g = gen(2);
  // const pro1 = g.next();
  // pro1.value.then((res: number) => {
  //   console.log(res);
  //   const pro2 = g.next(res * 2);
  //   pro2.value.then((res: number) => {
  //     console.log(res);
  //     const pro3 = g.next(res * 2);
  //     pro3.value.then((res: number) => {
  //       console.log(res);
  //       const pro4 = g.next(res * 2);
  //       console.log(pro4);
  //     });
  //   });
  // });

  // async高阶函数实现

  function foo(num: any) {
    // console.log(num);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(num * 2);
      }, 1000);
    });
  }

  function* gen(): Generator<Promise<any>> {
    const num1 = yield foo(1);
    const num2 = yield foo(num1);
    const num3 = yield foo(num2);
    return num3;
  }

  // 模拟async
  function generatorToaAsync(generatorFn: any) {
    // ...
    //具有async功能的函数
    return () => {
      // const gen = generatorFn.apply(this, arguments) as any;
      const gen = generatorFn()

      return new Promise((resolve, reject) => {
        function loop(key: any, arg?: any) {
          let res = null;

          res = gen[key](arg); // 等价于gen.next(arg)  // { value: Promise { <pending> }, done: false }

          const { value, done } = res as any;
          if (done) {
            return resolve(value);
          } else {
            // 没执行完yield
            // Promise.resolve(value) 为了保证value 中 Promise状态已经变更成'fulfilled'
            Promise.resolve(value).then((val) => loop('next', val));
          }
        }

        loop('next');
      });
    };
  }

  const asyncFn = generatorToaAsync(gen);

  // console.log(asyncFn());  // Promise{}

  asyncFn().then((res) => {
    console.log(res);
  });
}
