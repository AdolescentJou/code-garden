import { memo, useState } from 'react';
import VirList3 from './fixed-height';
const TestVirtual = () => {
  const [items] = useState(new Array(10000).fill(1));
  const ItemBox = memo(({ data = '', index = 0, style = 0 }: any) => {
    return (
      <div style={style} id={`item-${index}`}>
        {data}
      </div>
    );
  });

  return (
    <div className={'container'} style={{ width: '600px', margin: 'auto', padding: '15px', border: '1px solid black' }}>
      <VirList3 list={items} containerHeight={500} ItemBox={ItemBox} />
    </div>
  );
};

export default TestVirtual;