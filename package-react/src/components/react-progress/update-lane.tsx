import React from 'react';

// React 更新优先级demo
class OriginDemo extends React.Component<any,any> {
  buttonRef:any;
  constructor(props:any) {
    super(props);
    this.buttonRef = React.createRef();
  }
  state = {
    count: 0,
  };
  componentDidMount() {
    const button = this.buttonRef.current;
    setTimeout(() => this.setState({ count: this.state.count+1 }), 580);
    setTimeout(() => this.setState({ count: this.state.count+2 }), 590);
    setTimeout(() => button.click(), 600);
    //   A2是常规优先级的更新，A1是button.click()产生高优先级的更新。ch
    //   A后边的数字表示优先级，lane模型中，越小优先级越高，1 > 2。
    //   updateQueue：A2 - A1
    //                1    +2
    //   以1的优先级来执行updateQueue，发现队列中第一个update A2 比当前的渲染优先级低，跳过它处理A1
    //     Base state: 0
    //     Updates: [A1]              <-  +2
    //     Result state: 2
    //
    //   以2的优先级来执行updateQueue，队列中的update都会被处理，A1之前已经被处理过一次，所以A1会以不同的优先级处理两次
    //     Base state: 0              <-  因为上次A2被跳过了，所以base state是A2之前的状态 0
    //
    //     Updates: [A2, A1]          <-  当A1被处理的时候，A2已经处理完了，在1的基础上进行+2操作
    //               1   +2
    //     Result state: 3

    // 这里和浏览器的处理状态有一定关系，每次打印的情况不一定相同
    // 正常情况打印 0 1 3 6
    // 触发批量更新打印 0 2 5
    // 触发调度打印 0 1 4 6
  }
  handleButtonClick = () => {
    this.setState((prevState:any) => {
      return { count: prevState.count + 3 };
    });
  };
  render() {
    console.log(this.state.count);
    
    return (
      <div className={'origin-demo'}>
        <p>不需要点击这个按钮，这个按钮是交给js去模拟点击用的，模拟点击之后产生的是高优先级任务</p>
        <button ref={this.buttonRef} onClick={this.handleButtonClick}>
          增加2
        </button>
        <div>{this.state.count}</div>
      </div>
    );
  }
}
export default OriginDemo;
