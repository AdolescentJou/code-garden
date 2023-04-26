new Promise((resolve, reject) => {
    Promise.resolve().then(() => {
        resolve({
            then: (resolve, reject) => resolve(1)
        });
        Promise.resolve().then(() => console.log(2));
    });
}).then(v => console.log(v));
// 2 1