import { forwardRef } from 'react';

// 如果父组件想获取子组件的元素，可以将ref传给子组件，但是子组件必须使用forwardRef进行包裹

export default forwardRef(function (props, ref:any) {
  return (
    <div>
      <p ref={ref}></p>
    </div>
  );
});
