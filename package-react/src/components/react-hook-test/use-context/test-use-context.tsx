import { useContext } from 'react';
import { AgeContext } from './age-context';

const TestUseConetext = () => {
  const { age } = useContext(AgeContext);
  return (
      <div style={{ fontSize: '22px', color: 'orange' }}>age:{age}</div>
  );
};

export default TestUseConetext;
