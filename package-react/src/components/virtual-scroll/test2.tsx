import { memo, useState } from 'react';
import VirList3 from './fixed-height';
import VirList4 from './indefinite-height';
const TestVirtual2 = () => {
  const [items] = useState(new Array(30).fill(1));
  const ItemBox = memo(({ data = '', index = 0, style = 0 }: any) => {
    let content = '';
    if (index % 2 === 0 )
      content =
        '啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊';
    else if (index % 3 === 0 )
      content =
        '的点点滴滴多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多多dddddddj';
    else
      content =
        'auwgb owbg oebg oen oen oien onei oneoiauwgb owbg oebg oen oen oien onei oneoi eauwgb owbg oebg oen oen oien onei oneoi eauwgb owbg oebg oen oen oien onei oneoi eauwgb owbg oebg oen oen oien onei oneoi eauwgb owbg oebg oen oen oien onei oneoi eauwgb owbg oebg oen oen oien onei oneoi eauwgb owbg oebg oen oen oien onei oneoi e e';
    return (
      <div style={style} id={`item-${index}`}>
        {content}
      </div>
    );
  });

  return (
    <div className={'container'} style={{ width: '600px', margin: 'auto', padding: '15px', border: '1px solid black' }}>
      <VirList4 list={items} containerHeight={500} ItemBox={ItemBox} />
    </div>
  );
};

export default TestVirtual2;
