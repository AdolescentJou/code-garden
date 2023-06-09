import styles from './index.module.scss';
import { request } from './utils';

// the chunk size
const SIZE = 1024 * 1024;

const FileUpload = () => {
  const handleFileChange = async (e: any) => {
    const [file] = e.target.files;
    if (!file) return;
    const { name } = file;
    const fileChunkList = createFileChunk(file);
    const data = fileChunkList.map(({ file }, index) => ({
      chunk: file,
      // 文件名 + 数组下标
      hash: name + '-' + index,
    }));
    await uploadChunks(data, name);
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
  const uploadChunks = async (chunkList: any, name: string) => {
    const requestList = chunkList
      .map(({ chunk, hash }: any) => {
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('hash', hash);
        formData.append('filename', name);
        return { formData };
      })
      .map(({ formData }: any) =>
        request({
          url: 'http://localhost:3000',
          data: formData,
        }),
      );
    // 并发请求
    await Promise.all(requestList);

    // 合并切片
    await mergeRequest(name);
  };

  const mergeRequest = async (fileName: string) => {
    await request({
      url: 'http://localhost:3000/merge',
      headers: {
        'content-type': 'application/json',
      },
      data: JSON.stringify({
        filename: fileName,
        size: SIZE,
      }),
    });
  };

  return <input type="file" onChange={handleFileChange} />;
};
export default FileUpload;
