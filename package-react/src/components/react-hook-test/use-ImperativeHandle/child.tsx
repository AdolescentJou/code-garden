import { forwardRef,useRef, useImperativeHandle } from 'react';

const Child = (props: any, ref: any) => {

  const divRef = useRef<any>();

  // 使用 useImperativeHandle 可以自定义父组件通过ref拿到的数据，包括dom，数值，函数
  useImperativeHandle(
    ref,
    () => {
      return {
        print,
        num,
        divRef,
      };
    },
    [],
  );

  const print = () => {
    console.log('这是子组件的方法');
  };

  const num = 20;

  return <div ref={divRef}>这是子组件的dom</div>;
};
export default forwardRef(Child);
