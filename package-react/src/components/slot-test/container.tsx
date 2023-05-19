import type { CSSProperties } from 'react';
import './index.less';
import Slot from './slot';

const SlotContainer = (props: any) => {
  const { children } = props;
  return (
    <div className="container">
      <div className="top common_box">
        <Slot slotname="top">{children}</Slot>
      </div>
      <div className="body common_box">
        <Slot slotname="body">{children}</Slot>
      </div>
      <div className="bottom common_box">
        <Slot slotname="bottom">{children}</Slot>
      </div>
    </div>
  );
};
export default SlotContainer;
