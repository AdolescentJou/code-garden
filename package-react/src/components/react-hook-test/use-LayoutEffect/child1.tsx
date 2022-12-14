import { useLayoutEffect } from 'react';

const Child = () => {
  // 使用useLayoutEffect来改变样式，页面不会发生闪烁
  useLayoutEffect(() => {
    const square: any = document.querySelector('.square');
    if (square) {
      square.style.transform = 'translate(-50%, -50%)';
      square.style.left = '50%';
      square.style.top = '50%';
      square.style.backgroundColor = 'blue';
    }
  }, []);

  return (
    <div
      className="center"
      style={{
        textAlign: 'center',
        margin: 0,
        padding: 0,
      }}
    >
      <div className="square" style={{ position: 'absolute', top: '50%', left: 0, width: '100px', height: '100px', background: 'red', borderRadius: '50%' }}></div>
    </div>
  );
};
export default Child;
