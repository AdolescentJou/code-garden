import React from 'react';

class EvenvTest extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = {
      event: null,
    };
    this.handleClick1 = this.handleClick1.bind(this);
    this.handleClick2 = this.handleClick2.bind(this);
  }

  handleClick1(e: any) {
    e.persist(); // 拒绝公用event
    this.setState({ event: e }); // 直接保存event对象，用于测试事件对象公用
  }

  handleClick2(e: any) {
    console.log(this.state.event.target);
  }

  render() {
    return (
      <div>
        <button onClick={this.handleClick1} key={1}>
          按钮1
        </button>
        <button onClick={this.handleClick2} key={2}>
          按钮2
        </button>
      </div>
    );
  }
}

export default EvenvTest;
