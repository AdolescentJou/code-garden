import { nextFrame } from '../../../utils/index.js';

export default class CdmationDigitalChange extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          width: 100%;
          height: 100%;
          color: #fff;
          background: #6FA8DC;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .previews {
          display: block;
          list-style: none;
        } 

        .previews>li {
          display: inline-block;
          min-width: 150px;
          padding: 20px;
          text-align: center;
          vertical-align: middle;
          justify-content: space-between;
        } 

        .preview_content {
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        } 

        .scroll {
          padding: 0;
          width: 100%;
          height: 100%;
          font-size: 30px;
          overflow: hidden;
          display: flex;
        } 

        .scroll .scroll_wrap {
          padding: 0;
          width: 100%;
          height: 100%;
          list-style: none;
          display: inline-flex;
          align-items: center;
          flex-direction: column;
        } 

        .scroll .scroll_wrap>li {
          font-size: inherit;
          width: 16px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        } 

        #singleScroll {
          font-size: 110px;
        } 

        #singleScroll>li {
          width: 100%;
        } 

        .multi_scroll {
          height: 40px;
        } 

        .income {
          height: 40px;
        }
      </style>
      <script id="content_tpl" type="text/html">
        <% for (let i = 0; i < list; i++) { %>
          <% if (i >= 10) { %>
            <li><%= i % 10 %></li>
          <% } else { %>
            <li><%= i %></li>
          <% } %>
        <% } %>
      </script>
      <ul class="previews">
        <li>
          <div class="preview_content">
            <div class="scroll">
              <ul class="scroll_wrap" id="singleScroll"></ul>
            </div>
          </div>
          <p class="preview_desc">数字滚动</p>
        </li>
        <li>
          <div class="preview_content">
            <div class="scroll multi_scroll">
              <ul class="scroll_wrap" id="multiScroll_1"></ul>
              <ul class="scroll_wrap" id="multiScroll_2"></ul>
              <ul class="scroll_wrap" id="multiScroll_3"></ul>
              <ul class="scroll_wrap" id="multiScroll_4"></ul>
            </div>
          </div>
          <p class="preview_desc">多数字滚动</p>
        </li>
        <li>
          <div class="preview_content">
            <div class="scroll income">
              <ul class="scroll_wrap" id="income_1"></ul>
              <ul class="scroll_wrap" id="income_2"></ul>
              ,
              <ul class="scroll_wrap" id="income_3"></ul>
              <ul class="scroll_wrap" id="income_4"></ul>
              <ul class="scroll_wrap" id="income_5"></ul>
              .
              <ul class="scroll_wrap" id="income_6"></ul>
              <ul class="scroll_wrap" id="income_7"></ul>
            </div>
          </div>
          <p class="preview_desc">累计总收益(元)</p>
        </li>
      </ul>
    `;
  }

  connectedCallback() {
    // 数字滚动变化
    this.singleScroll();
    // 多数字滚动
    this.multiScroll();
    // 累计总收益（元）
    this.income();
  }
  disconnectedCallback() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  get slow() {
    return this.getAttribute('slow');
  }
  timer = null;

  singleScroll() {
    let node = this.shadowRoot.querySelector('#singleScroll');
    node.innerHTML = elfinTpl(
      this.shadowRoot.querySelector('#content_tpl').innerHTML,
      { list: 11 },
    );
    let start = 0;
    let time = this.slow === 'true' ? 2000 : 500;
    this.timer = setInterval(fn.bind(this), 200);
    function fn() {
      start++;
      clearInterval(this.timer);
      this.timer = setInterval(fn.bind(this), start > 10 ? 0 : time + 100);
      if (start > 10) {
        node.style.transition = 'none';
        start = 0;
      } else {
        node.style.transition = `transform ${time}ms ease-in-out`;
      }
      node.style.transform = `translateY(-${start * 100}%)`;
    }
  }
  multiScroll() {
    setTransition.call(this, this.shadowRoot.querySelector('#multiScroll_1'), parseInt(Math.random() * 10), 0);
    setTransition.call(this, this.shadowRoot.querySelector('#multiScroll_2'), parseInt(Math.random() * 10), 1);
    setTransition.call(this, this.shadowRoot.querySelector('#multiScroll_3'), parseInt(Math.random() * 10), 2);
    setTransition.call(this, this.shadowRoot.querySelector('#multiScroll_4'), parseInt(Math.random() * 10), 3);
    function setTransition(node, num, sort) {
      node.innerHTML = elfinTpl(
        this.shadowRoot.querySelector('#content_tpl').innerHTML,
        { list: 10 },
      );
      node.style.transition = `transform ${this.slow === 'true' ? '5000' : '500'}ms ease-out`;

      nextFrame(() => {
        node.style.transform = `translateY(-${num * 100}%)`;
      });
    }
  }
  income() {
    setTransition.call(this, this.shadowRoot.querySelector('#income_1'), 4, 6, 0);
    setTransition.call(this, this.shadowRoot.querySelector('#income_2'), 0, 4, 1);
    setTransition.call(this, this.shadowRoot.querySelector('#income_3'), 7, 9, 2);
    setTransition.call(this, this.shadowRoot.querySelector('#income_4'), 0, 2, 3);
    setTransition.call(this, this.shadowRoot.querySelector('#income_5'), 6, 8, 4);
    setTransition.call(this, this.shadowRoot.querySelector('#income_6'), 1, 3, 5);
    setTransition.call(this, this.shadowRoot.querySelector('#income_7'), 4, 9, 6);
    function setTransition(node, cnum, num, sort) {
      node.innerHTML = elfinTpl(
        this.shadowRoot.querySelector('#content_tpl').innerHTML,
        { list: 10 },
      );
      node.style.transform = `translateY(-${cnum * 100}%)`;
      node.style.transition = `transform ${this.slow === 'true' ? '2000' : '200'}ms ease-out ${this.slow === 'true' ? sort * 1000 : sort * 50}ms`;

      nextFrame(() => {
        node.style.transform = `translateY(-${num * 100}%)`;
      });
    }
  }
}

if (!customElements.get('cdmation-digital-change')) {
  customElements.define('cdmation-digital-change', CdmationDigitalChange);
}
