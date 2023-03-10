namespace test {
  export function awaitWrap<T>(promise: Promise<T>) {
    return new Promise<[number, T | null]>((resolve, reject) => {
      promise
        .then((res) => {
          resolve([1, res]);
        })
        .catch(() => {
          resolve([-1, null]);
        });
    });
  }

  const test = new Promise((resolve, reject) => {
    resolve(123);
  });

  async function getPromiseRes() {
    const a = await test.then((res) => {
      console.log('res', res);
    });
    console.log('a', a);
  }
  getPromiseRes();
}
