import React from 'react';
import './index.less';

class HeightClassify extends React.Component<any, any> {
  scrollRef: any;
  pRef: any = {};
  constructor(props: any) {
    super(props);
    this.state = {
      value: '',
      el: -1,
    };
    this.handleInputOnchange = this.handleInputOnchange.bind(this);
    this.handleJumpTo = this.handleJumpTo.bind(this);
  }

  handleInputOnchange(e: any) {
    this.setState({ value: e.target.value });
  }

  handleJumpTo() {
    const { value } = this.state;
    const containerHeight = this.scrollRef.clientHeight;
    const containerOffsetTop = this.scrollRef.getBoundingClientRect().top;

    // 元素的高度，和距离浏览器的高度
    const { top } = this.pRef[`ref${value}`].getBoundingClientRect();

    // needScroll就是元素底部距离滚动容器顶部的距离
    const needScroll = top - containerOffsetTop - 20;
    
    if (needScroll > containerHeight || needScroll < 0) {
      // 将选中元素放入容器视口中
      const timer = setTimeout(() => {
        this.scrollRef.scrollTop = this.scrollRef.scrollTop + needScroll;
        clearTimeout(timer);
      }, 0);
    }

    this.setState({ el: value });
  }

  render() {
    const { value, el } = this.state;
    return (
      <div className='container'>
        <div className='scroll' ref={(ref) => (this.scrollRef = ref)}>
            {new Array(15).fill(0).map((_item, index) => (
              <p
                key={index}
                ref={(ref) => (this.pRef[`ref${index}`] = ref)}
                style={{ backgroundColor: Number(el) === index ? 'red' : '' }}
              >{`这是第${index}文段`}</p>
            ))}
        </div>
        <div className='search'>
          <input onChange={this.handleInputOnchange} value={value} />
          <button onClick={this.handleJumpTo}>跳转</button>
        </div>
      </div>
    );
  }
}

export default HeightClassify;
