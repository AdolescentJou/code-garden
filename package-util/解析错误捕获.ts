// 编码失败返回默认值或者为空
export function encodeTry(str, defStr: any = '') {
  try {
    return encodeURIComponent(str);
  } catch (error) {
    console.error('encodeTry', error);
  }
  return defStr || '';
}

// 解码失败返回默认值或者为空
export function decodeTry(str, defStr: any = '') {
  try {
    return decodeURIComponent(str);
  } catch (error) {
    console.error('decodeTry', error);
  }
  return defStr || '';
}

// 解析JSON
export function parseJSON(str, defVal: any = '') {
  try {
    return JSON.parse(str);
  } catch (error) {
    console.error('parseJSON', error);
  }
  return defVal || '';
}

// async错误捕获
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