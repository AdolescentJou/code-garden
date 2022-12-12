import React from 'react';
import TestUseMemo from './children';

class UseCallbackContainer extends React.Component<any, any> {
  constructor(props: any) {
    super(props);

    this.state = {
      num: 0,
      check: false,
    };
  }

  render() {
    const { num, check } = this.state;
    return (
      <div>
        <button
          onClick={() => {
            this.setState({ num: num + 1 });
          }}
        >
          set num
        </button>
        <button
          onClick={() => {
            this.setState({ check: !check });
          }}
        >
          refresh
        </button>
        <TestUseMemo num={num} />
      </div>
    );
  }
}
export default UseCallbackContainer;
