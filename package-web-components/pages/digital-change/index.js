import '../../components/business/demo/index.js';

class DigitalChange extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        h1 {
          font-weight: 500;
          font-size: 28px;
          color: #404040;
          margin: 0 auto 10px;
        }
      </style>
      <script id="demo_tpl" type="text/html">
        <cdmation-digital-change slow="<%= slow %>"></cdmation-digital-change>
      </script>
      <cdmation-demo></cdmation-demo>

      <h2>数字滚动</h2>
      <section>数字上下滚动出现。</section>

      <h2>动效分析</h2>
      <cdmation-table thead="0ms,50ms,100ms,150ms,200ms">
        <cdmation-tr>
          <cdmation-td>进场</cdmation-td>
          <cdmation-td>第一个数字</cdmation-td>
          <cdmation-td>translateY位移</cdmation-td>
          <cdmation-td> 0 - x00%<br/>和具体的数字有关</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
          <cdmation-td end></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
        </cdmation-tr>
        <cdmation-tr>
          <cdmation-td></cdmation-td>
          <cdmation-td>第二个数字</cdmation-td>
          <cdmation-td>translateY位移</cdmation-td>
          <cdmation-td> 0 - x00%</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>延时50ms</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
          <cdmation-td end></cdmation-td>
          <cdmation-td></cdmation-td>
        </cdmation-tr>
        <cdmation-tr>
          <cdmation-td></cdmation-td>
          <cdmation-td>第三个数字</cdmation-td>
          <cdmation-td>translateY位移</cdmation-td>
          <cdmation-td> 0 - x00%</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>延时100ms</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
          <cdmation-td end></cdmation-td>
        </cdmation-tr>
        <cdmation-tr>
          <cdmation-td></cdmation-td>
          <cdmation-td>后面的数字</cdmation-td>
          <cdmation-td>translateY位移</cdmation-td>
          <cdmation-td> 0 - x00%</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>依次类推</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
        </cdmation-tr>
      </cdmation-table>

      <h2>真实案例</h2>

      <h2>代码片段</h2>
    `;
  }

  connectedCallback() {
    this.demoEl = this.shadowRoot.querySelector('cdmation-demo');
    this.renderDemo();
    
    this.onPlay = this.onPlay.bind(this);
    this.demoEl.addEventListener('play', this.onPlay);
  }
  disconnectedCallback() {
    this.demoEl.removeEventListener('play', this.onPlay);
  }

  renderDemo(slow = false) {
    this.demoEl.innerHTML = elfinTpl(
      this.shadowRoot.querySelector('#demo_tpl').innerHTML,
      { slow },
    );
  }
  onPlay(event) {
    this.renderDemo(event.detail.slow);
  }
}

if (!customElements.get('digital-change')) {
  customElements.define('digital-change', DigitalChange);
}