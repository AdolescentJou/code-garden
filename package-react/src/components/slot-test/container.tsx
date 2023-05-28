import type { CSSProperties } from 'react';
import './index.less';
import Slot from './slot';

const SlotContainer = (props: any) => {
  const { children } = props;
  const topClickFunc  = () => {
    console.log('这是顶部');
    
  }
  const middleClickFunc  = () => {
    console.log('这是中间');
    
  }
  const bottomClickFunc  = () => {
    console.log('这是底部');
    
  }
  return (
    <div className="container">
      <div className="top common_box">
        <Slot slotname="top" handleClick={topClickFunc}>{children}</Slot>
      </div>
      <div className="body common_box">
        <Slot slotname="body" handleClick={middleClickFunc}>{children}</Slot>
      </div>
      <div className="bottom common_box">
        <Slot slotname="bottom" handleClick={bottomClickFunc}>{children}</Slot>
      </div>
    </div>
  );
};
export default SlotContainer;
