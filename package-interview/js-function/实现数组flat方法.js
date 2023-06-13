const myFlat = (arr) => {
  let newArr = [];
  let cycleArray = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      let item = arr[i];
      if (Array.isArray(item)) {
        cycleArray(item);
        continue;
      } else {
        newArr.push(item);
      }
    }
  };
  cycleArray(arr);
  return newArr;
};

myFlat(arr); // [1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 9, 11, 12, 12, 13, 14, 10]
