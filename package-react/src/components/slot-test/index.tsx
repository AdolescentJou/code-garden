import type { CSSProperties } from 'react';
import SlotContainer from './container';
import { VSlot } from './slot';

const SlotTest = () => {
  return (
    <SlotContainer>
      <VSlot slotname="top">
        <p>这是top</p>
      </VSlot>
      <VSlot slotname="body">
        <p>这是body</p>
      </VSlot>
      <VSlot slotname="bottom">
        <p>这是bottom</p>
      </VSlot>
    </SlotContainer>
  );
};
export default SlotTest;
