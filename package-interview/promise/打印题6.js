Promise.resolve()
  .then(() => {
    console.log(0);
    return new Promise((resolve, reject) => {
      resolve(4);
    }); // 这个promise完成了，才相当于第一个promise得到完成
  })
  .then((res) => {
    console.log(res);
  });

Promise.resolve()
  .then(() => {
    console.log(1);
  })
  .then(() => {
    console.log(2);
  })
  .then(() => {
    console.log(3);
  })
  .then(() => {
    console.log(5);
  })
  .then(() => {
    console.log(6);
  });

// then()
