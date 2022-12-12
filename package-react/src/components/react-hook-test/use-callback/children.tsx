import { useCallback, useEffect, useMemo } from 'react';

const UseCallbackChild = (props: any) => {
  const { num } = props;
  // 只有父组件的num发生更改，才重新创建新函数
  const func = useCallback(() => {
    console.log(`num is ${num}`);
  }, [num]);
  useEffect(() => {
    func();
    return () => {
      console.log('这里是组件销毁逻辑');
    }
  }, []);
  return <div></div>;
};
export default UseCallbackChild;
