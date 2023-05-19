class CdmationTr extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          display: contents;
        }
      </style>
      <slot></slot>  
    `;
  }

  connectedCallback() {}
}

if (!customElements.get('cdmation-tr')) {
  customElements.define('cdmation-tr', CdmationTr);
}

class CdmationTd extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          color: #000;
          display: flex;
          padding: 16px;
          font-size: 14px;
          position: relative;
          text-align: center;
          align-items: center;
          justify-content: center;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .line {
          width: 100%;
          height: 2px;
          position: absolute;
          background: #6FA8DC;
        }

        .line.start {
          width: 50%;
          left: 50%;
        }

        .line.start::before {
          content: '';
          width: 10px;
          height: 10px;
          display: block;
          position: relative;
          top: -4px;
          background: #6FA8DC;
          transform: rotate(45deg);
        }

        .line.end::after {
          content: '';
          width: 10px;
          height: 10px;
          display: block;
          position: relative;
          top: -4px;
          left: 100%;
          background: #6FA8DC;
          transform: rotate(45deg);
        }

        .line.end {
          width: 50%;
          left: 0;
        }

        .tips {
          position: absolute;
          left: 50%;
          top: -20px;
          transform: translateX(-50%);
        }
      </style>
      ${this.start ? '<div class="line start"></div>' : ''}
      ${this.continue ? `<div class="line">${this.tips ? `<div class="tips">${this.tips}</div>` : ''}</div>` : ''}
      ${this.end ? '<div class="line end"></div>' : ''}
      <slot></slot>
    `;
  }

  get start() {
    return this.getAttribute('start') !== null;
  }
  get continue() {
    return this.getAttribute('continue') !== null;
  }
  get end() {
    return this.getAttribute('end') !== null;
  }
  get tips() {
    return this.getAttribute('tips');
  }
}

if (!customElements.get('cdmation-td')) {
  customElements.define('cdmation-td', CdmationTd);
}

export default class CdmationTable extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          display: grid;
          line-height: 1.5;
          grid-row-gap: 1px;
          position:relative;
          grid-template-columns: repeat(6, minmax(115px, 1fr)) ${this.thead.map(() => 'auto').join(' ')};
          overflow-x: auto;
          padding: 0 16px;
        }

        .th {
          color: #fff;
          display: flex;
          padding: 16px;
          font-weight: bold;
          position: relative;
          align-items: center;
          background: #6FA8DC;
          justify-content: center;
        }
      </style>
      <div class="th">触发时机</div>
      <div class="th">对象</div>
      <div class="th">变化属性</div>
      <div class="th">变化方式</div>
      <div class="th">贝塞尔曲线</div>
      <div class="th">备注</div>
      ${this.thead.map(el => '<div class="th">' + el + '</div>').join('')}
      <slot></slot>
    `;
  }

  get thead() {
    const thead = this.getAttribute('thead');
    return thead ? thead.split(',') : [];
  }

  connectedCallback() {}
}

if (!customElements.get('cdmation-table')) {
  customElements.define('cdmation-table', CdmationTable);
}
