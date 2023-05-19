import '../../components/business/demo/index.js';

class RingLoading extends HTMLElement {
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
        <cdmation-ring-loading slow="<%= slow %>"></cdmation-ring-loading>
      </script>
      <cdmation-demo window></cdmation-demo>

      <h2>环形加载</h2>

      <h2>动效分析</h2>

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

if (!customElements.get('ring-loading')) {
  customElements.define('ring-loading', RingLoading);
}