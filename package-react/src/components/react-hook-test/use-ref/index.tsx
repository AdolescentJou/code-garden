import { useRef, useState } from 'react';

const TestUseRef = () => {
  const [count, setCount] = useState(0);
  // 普通变量无法跨生命周期保存
  // 重新渲染之后会成0
  // let num = 0;

  // 使用ref,跨生命周期保存变量
  // 0作为初始值会保存到num.current上
  let num:any = useRef(0);

  return (
    <div>
      <button
        onClick={() => {
          setCount(count + 1);
          console.log('num', num.current);
        }}
      >
        count + 1
      </button>
      <button
        onClick={() => {
          num.current = num.current + 1;
          console.log('num', num.current);
        }}
      >
        num + 1
      </button>
      <p>count:{count}</p>
    </div>
  );
};
export default TestUseRef;
