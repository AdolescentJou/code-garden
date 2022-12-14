import { useState } from 'react';
import Test from './Test';

const TestUseLayoutEffect = () => {
  const [refresh, setRefresh] = useState(false);

  return (
    <div>
      <button
        onClick={() => {
          setRefresh(!refresh);
        }}
      >刷新页面</button>
      <Test/>;
    </div>
  );
};
export default TestUseLayoutEffect;
