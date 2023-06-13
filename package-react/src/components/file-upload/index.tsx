import { useState } from 'react';
import styles from './index.module.scss';
import { request } from './utils';

// the chunk size
const SIZE = 1024 * 1024;
let worker: any = null;
let requestListControl: any = [];
const FileUpload = () => {
  const [fileChunks, setFileChunks] = useState<any>([]);
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');

  const handleFileChange = async (e: any) => {
    const [file] = e.target.files;
    if (!file) return;
    const { name } = file;
    const chunkList = createFileChunk(file);

    const hash: any = await calculateHash(chunkList);

    const { shouldUpload, uploadedList } = await verifyUpload(name, hash);

    if (!shouldUpload) {
      alert('文件已经存在');
      return;
    }

    const data = chunkList.map(({ file }, index) => ({
      filehash: hash,
      chunk: file,
      // 文件名 + 数组下标
      hash: name + '-' + index,
      index,
      percentage: 0,
    }));
    setFileChunks(data);
    setFileName(name);
    setFileHash(hash);
    await uploadChunks(data, name, hash, uploadedList);
  };

  // 生成文件切片
  const createFileChunk = (file: any, size = SIZE) => {
    const fileChunkList = [];
    let cur = 0;
    while (cur < file.size) {
      fileChunkList.push({ file: file.slice(cur, cur + size) });
      cur += size;
    }
    return fileChunkList;
  };

  // 上传切片
  const uploadChunks = async (fileChunkList: any, name: string, filehash: string, uploadedList: any) => {
    const requestList = fileChunkList
      .filter(({ hash }: any) => !uploadedList.includes(hash))
      .map(({ chunk, hash, index }: any) => {
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('hash', hash);
        formData.append('filename', name);
        return { formData, index };
      })
      .map(({ formData, index }: any) =>
        request({
          url: 'http://localhost:3000',
          data: formData,
          requestList: requestListControl,
          onProgress: createProgressHandler(fileChunkList, index),
        }),
      );
    // 并发请求
    await Promise.all(requestList);

    // 合并切片
    if (uploadedList.length + requestList.length === fileChunkList.length) {
      await mergeRequest(name, filehash);
    }
  };

  // 合并切片
  const mergeRequest = async (fileName: string, filehash: string) => {
    await request({
      url: 'http://localhost:3000/merge',
      headers: {
        'content-type': 'application/json',
      },
      data: JSON.stringify({
        filename: fileName,
        size: SIZE,
        filehash,
      }),
    });
  };

  const createProgressHandler = (fileChunkList: any, index: number) => {
    return (e: any) => {
      let newFileChunks = [...fileChunkList];
      newFileChunks[index].percentage = parseInt(String((e.loaded / e.total) * 100));
      setFileChunks(newFileChunks);
    };
  };

  const getTotalPercent = (fileChunkList: any) => {
    if (!fileChunkList || !fileChunkList.length) return 0;
    const loaded = fileChunkList.map((item: any) => item.percentage).reduce((acc: any, cur: any) => acc + cur, 0);
    return parseInt((loaded / fileChunkList.length).toFixed(2));
  };

  // 生成文件 hash（web-worker）
  const calculateHash = (fileChunkList: any) => {
    return new Promise((resolve) => {
      // 添加 worker 属性
      // 这里的hash.js做为静态资源存放到public目录下
      worker = new Worker('/hash.js');
      worker.postMessage({ fileChunkList });
      worker.onmessage = (e: any) => {
        const { percentage, hash } = e.data;
        // hashPercentage = percentage;
        if (hash) {
          resolve(hash);
        }
      };
    });
  };

  // 通过hash校验是否已经上传成功
  const verifyUpload = async (filename: any, fileHash: any) => {
    const { data } = await request({
      url: 'http://localhost:3000/verify',
      headers: {
        'content-type': 'application/json',
      },
      data: JSON.stringify({
        filename,
        fileHash,
      }),
    });
    return JSON.parse(data);
  };

  // 暂停上传
  const handlePause = () => {
    requestListControl.forEach((xhr: any) => xhr?.abort());
    requestListControl = [];
  };

  // 恢复上传
  const handleResume = async () => {
    const { uploadedList } = await verifyUpload(fileName, fileHash);
    let newFileChunks = fileChunks.map((item: any) => {
      if (uploadedList.includes(item.hash)) {
        item.percentage = 100;
      }
      return item;
    });

    await uploadChunks(newFileChunks, fileName, fileHash, uploadedList);
  };

  return (
    <div>
      <div>
        <input type="file" onChange={handleFileChange} />
      </div>
      <div>
        <button onClick={handlePause}>暂停上传</button>
      </div>
      <div>
        <button onClick={handleResume}>恢复上传</button>
      </div>
      <p>上传进度：{getTotalPercent(fileChunks)}%</p>
    </div>
  );
};
export default FileUpload;
