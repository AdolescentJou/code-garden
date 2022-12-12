import { useEffect, useMemo } from 'react';

const UseMemoChild = (props: any) => {
  const { num } = props;
  // 只有父组件的num发生更改，才重新创建msg对象
  const msg = useMemo(() => {
    return {
      info: `hello world${num}`,
    };
  }, [num]);
  useEffect(() => {
    console.log('msg:', msg.info);
  }, [msg]);
  return <div></div>;
};
export default UseMemoChild;
