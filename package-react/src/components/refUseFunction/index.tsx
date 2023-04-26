import { useCallback, useState } from 'react';

// 当组件的ref属性传入的是一个函数时
// 组件的示例node将作为函数的参数

function MeasureExample() {
  const [entry, setEntry] = useState<any>(null);

  const measuredRef = useCallback((node: any) => {
    const observer = new ResizeObserver(([entry]) => {
      setEntry(entry);
    });

    observer.observe(node);
    // 解绑事件
    return () => {
      observer.disconnect();
    };
  }, []);

  console.log('entry', entry);

  return <div ref={measuredRef}>Hello world</div>;
}

export default MeasureExample;