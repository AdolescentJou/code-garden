import { nextFrame } from '../../../utils/index.js';

export default class CdmationRingLoading extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          position: relative;
        }
      </style>
      <canvas id="mycanvas" style="height: 250px; width:250px;" width="250" height="250"></canvas>
    `;
  }

  connectedCallback() {
    let canvas = this.shadowRoot.querySelector('#mycanvas');
    let count = 0, totalCount = this.slow === 'true' ? 300 : 50;

    let defaultAngle = Math.PI * 1.5;
    let maxAngle = Math.PI * 3.5;
    let currentAngle1 = defaultAngle,
      currentAngle2 = defaultAngle,
      currentAngle3 = defaultAngle,
      currentAngle4 = defaultAngle;
    let radius = 100;

    function animate() {
      currentAngle1 = easeOut(count, defaultAngle, Math.PI * 2, totalCount);
      currentAngle2 = easeOut(count, defaultAngle, Math.PI * 1.75, totalCount);
      currentAngle3 = easeOut(count, defaultAngle, Math.PI * 0.75, totalCount);
      currentAngle4 = easeOut(count, defaultAngle, Math.PI * 0.25, totalCount);
      count++;

      if (currentAngle1 >= maxAngle) {
        currentAngle1 = maxAngle;
        draw(); // 绘制圆环
        return
      }
      draw(); // 绘制圆环
      nextFrame(animate);
    }
    function draw() {
      let ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.beginPath();
      ctx.arc(125, 125, radius, defaultAngle, currentAngle1);
      ctx.strokeStyle = '#6FA8DC';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.save();

      ctx.beginPath();
      ctx.arc(125, 125, radius, defaultAngle, currentAngle2);
      ctx.strokeStyle = '#7DD6CC';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.save();

      ctx.beginPath();
      ctx.arc(125, 125, radius, defaultAngle, currentAngle3);
      ctx.strokeStyle = '#F9E1A3';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.save();

      ctx.beginPath();
      ctx.arc(125, 125, radius, defaultAngle, currentAngle4);
      ctx.strokeStyle = '#F3ABA9';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    /*
     * t: current time（当前时间）；
     * b: beginning value（初始值）；
     * c: change in value（变化量）；
     * d: duration（持续时间）。
    */
    function easeOut(t, b, c, d) {
      return c * ((t = t/d - 1) * t * t + 1) + b;
    }

    nextFrame(animate);
  }

  get slow() {
    return this.getAttribute('slow');
  }
}

if (!customElements.get('cdmation-ring-loading')) {
  customElements.define('cdmation-ring-loading', CdmationRingLoading);
}
