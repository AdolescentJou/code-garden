import { nextFrame } from '../../../utils/index.js';

export default class CdmationDelaylist extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          display: grid;
          grid-gap: 12px;
          grid-template-columns: repeat(4, 1fr);
          overflow: hidden;
        }
      </style>
      <slot id="slot"></slot>
    `;
  }

  connectedCallback() {
    this.shadowRoot.addEventListener('slotchange', () => {
      this.startAnimation();
    });
  }

  get slow() {
    return this.getAttribute('slow');
  }

  getDelay = (index, length) => {
    let i = index + length % 4;
    let duration = this.slow === 'true' ? 500 : 100;
    return (i % 4) * duration + Math.floor(i / 4) * duration + 50;
  };
  startAnimation() {
    // 下一个动画帧
    nextFrame(() => {
      let nodes = this.querySelectorAll('cdmation-delay-list-item');
      nodes.forEach((node, index) => {
        // 延时时间
        node.style.transitionDelay = this.getDelay(index, nodes.length) + 'ms';
        node.style.opacity = '1';
      });
    });
  }
}

if (!customElements.get('cdmation-delay-list')) {
  customElements.define('cdmation-delay-list', CdmationDelaylist);
}
