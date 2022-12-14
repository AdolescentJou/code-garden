import { useRef } from 'react';
import Son from './child';


// 函数组件和class组件不同，函数组件的ref必须绑定在具体的某个元素上
// 组件是不能直接获取ref属性的，其内部必须有相关的实现
// 如果父组件想获取子组件的元素，可以将ref传给子组件，但是子组件必须使用forwardRef进行包裹

const TestForwardRef = () => {
  const eleP = useRef();

  const getElement = () => {
    console.log(eleP.current);
  };

  return (
    <div>
      <button onClick={() => getElement()}>点击获取子组件1的p元素</button>
      <Son ref={eleP} />
    </div>
  );
};

export default TestForwardRef;
