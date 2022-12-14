import { useEffect, useLayoutEffect } from 'react';

const Test = () => {

  // 会在所有的 DOM 变更之后同步调用 effect。可以使用它来读取 DOM 布局并同步触发重渲染。
  // 在浏览器执行绘制之前，useLayoutEffect 内部的更新计划将被同步刷新。
  useEffect(() => {
    console.log('useEffect');
  },[]);

  // 这段代码为同步代码,会先于useEffec之前打印
  useLayoutEffect(() => { 
    console.log('useLayoutEffect');
  }, []);
  
  

  return <div></div>;
};
export default Test;
