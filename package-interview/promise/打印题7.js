const p1 = new Promise((resolve, reject) => {
  const p2 = Promise.resolve().then(() => {
      resolve({
          then: (resolve, reject) => resolve(1)
      });
      const p3 = Promise.resolve().then(() => console.log(2));
  });
}).then(v => console.log(v));
// 2 1