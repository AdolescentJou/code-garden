import { useMemo } from "react";

const TestUseMemo = (props: any) => {
  const { num } = props;
  const computedNum = useMemo(() => num * 10, [num]);
  return <div>Children组件 : {num}</div>;
};
export default TestUseMemo;
