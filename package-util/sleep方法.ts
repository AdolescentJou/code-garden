const sleep = (delay) => {
  for (let start = Date.now(); Date.now() - start <= delay; ) {}
};

const loadingForSomeTime = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('');
    }, 400);
  });
};