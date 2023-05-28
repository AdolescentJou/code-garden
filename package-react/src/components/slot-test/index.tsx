import type { CSSProperties } from 'react';
import SlotContainer from './container';
import { VSlot } from './slot';

const SlotInner = (props: any) => {
  const { children, handleClick } = props;
  return <div onClick={handleClick}>{children}</div>;
};

const SlotTest = () => {
  return (
    <SlotContainer>
      <VSlot slotname='top'>
        <SlotInner>
          <p>这是top</p>
        </SlotInner>
      </VSlot>
      <VSlot slotname='body'>
        <SlotInner>
          <p>这是body</p>
        </SlotInner>
      </VSlot>
      <VSlot slotname='bottom'>
        <SlotInner>
          <p>这是bottom</p>
        </SlotInner>
      </VSlot>
    </SlotContainer>
  );
};
export default SlotTest;
