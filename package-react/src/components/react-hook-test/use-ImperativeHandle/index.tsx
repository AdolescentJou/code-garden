// useImperativeHandle 可以让你在使用 ref 时自定义暴露给父组件的实例值。

import { useRef } from 'react';
import Child from './child';

// useImperativeHandle 应当与 forwardRef 一起使用：
const TestUseImperativeHandle = () => {
  const ref = useRef<any>();

  const printInfo = () => {
    console.log('拿到的子组件属性');
    console.log(ref.current);
  };

  return (
    <div>
      <button
        onClick={() => {
          printInfo();
        }}
      >
        一键获取子元素信息
      </button>
      <Child ref={ref} />
    </div>
  );
};

export default TestUseImperativeHandle;
