export function request({ url, method = 'post', data, headers = {}, requestList, onProgress = (e: any) => e }: any) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = onProgress;
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]));
    xhr.send(data);
    xhr.onload = (e: any) => {
      resolve({
        data: e.target.response,
      });
    };
  });
}
