import '../../components/business/demo/index.js';
import '../../components/business/table/index.js';

class DelayList extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        cdmation-delay-list {
          width: 500px;
          height: 290px;
        }

        h1 {
          font-weight: 500;
          font-size: 28px;
          color: #404040;
          margin: 0 auto 10px;
        }
      </style>
      <script id="demo_tpl" type="text/html">
        <cdmation-delay-list slow="<%= slow %>">
          <% for (i = 0, l = list.length; i < l; i++) { %>
            <cdmation-delay-list-item>
              <img src="<%= list[i].image %>" style="display: block;" width="100%" height="100%" onclick="bindImgClick(event, '<%= list[i].component %>', '<%= list[i].path %>')" />
            </cdmation-delay-list-item>
          <% } %>
        </cdmation-delay-list>
      </script>
      <cdmation-demo window></cdmation-demo>

      <h2>卡片波浪显示</h2>
      <section>
        <p>卡片的表格式布局，动效应该让用户的注意沿着对角线的流向来引导。</p>
        <p>逐个显示，一方面耗时太长，另一方面会让用户觉得元素的加载方式是锯齿状的。</p>
      </section>

      <h2>动效说明文档</h2>
      <cdmation-table thead="50ms,150ms,250ms,350ms,450ms">
        <cdmation-tr>
          <cdmation-td>进场</cdmation-td>
          <cdmation-td>图片(1,1)</cdmation-td>
          <cdmation-td>opacity透明度</cdmation-td>
          <cdmation-td>0 - 1</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>延时50ms</cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
          <cdmation-td end></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
        </cdmation-tr>
        <cdmation-tr>
          <cdmation-td></cdmation-td>
          <cdmation-td>图片(1,2)(2,1)</cdmation-td>
          <cdmation-td>opacity透明度</cdmation-td>
          <cdmation-td>0 - 1</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>延时150ms</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
          <cdmation-td end></cdmation-td>
          <cdmation-td></cdmation-td>
        </cdmation-tr>
        <cdmation-tr>
          <cdmation-td></cdmation-td>
          <cdmation-td>图片(1,3)(2,2)(3,1)</cdmation-td>
          <cdmation-td>opacity透明度</cdmation-td>
          <cdmation-td>0 - 1</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>延时250ms</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue tips="200ms"></cdmation-td>
          <cdmation-td end></cdmation-td>
        </cdmation-tr>
        <cdmation-tr>
          <cdmation-td></cdmation-td>
          <cdmation-td>后面的图片</cdmation-td>
          <cdmation-td>opacity透明度</cdmation-td>
          <cdmation-td>0 - 1</cdmation-td>
          <cdmation-td>ease-out<br/>(0,0,.58,1)</cdmation-td>
          <cdmation-td>依次类推</cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td></cdmation-td>
          <cdmation-td start></cdmation-td>
          <cdmation-td continue></cdmation-td>
        </cdmation-tr>
      </cdmation-table>

      <h2>真实案例</h2>
      <elmation-video src="./assets/delay-list.mp4"></elmation-video>

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
    let list = [
      { image: 'https://zos.alipayobjects.com/rmsportal/DGOtoWASeguMJgV.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/BXJNKCeUSkhQoSS.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/TDIbcrKdLWVeWJM.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/SDLiKqyfBvnKMrA.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/UcVbOrSDHCLPqLG.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/QJmGZYJBRLkxFSy.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/PDiTkHViQNVHddN.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/beHtidyjUMOXbkI.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/vJcpMCTaSKSVWyH.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/dvQuFtUoRmvWLsZ.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/QqWQKvgLSJaYbpr.png' },
      { image: 'https://zos.alipayobjects.com/rmsportal/pTfNdthdsUpLPLJ.png' },
    ];
    this.demoEl.innerHTML = elfinTpl(
      this.shadowRoot.querySelector('#demo_tpl').innerHTML,
      { list, slow },
    );
  }
  onPlay(event) {
    this.renderDemo(event.detail.slow);
  }
}

if (!customElements.get('delay-list')) {
  customElements.define('delay-list', DelayList);
}