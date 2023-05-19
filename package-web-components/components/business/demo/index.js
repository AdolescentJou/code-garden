import '../../universal/icon/index.js';

export default class CdmationDemo extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        .demo_wrapper {
          position: relative;
          background: #6FA8DC;
          overflow: hidden;
          height: 500px;
        }

        .demo {
          width: 100%;
          height: 100%;
          min-width: 550px;
          overflow: hidden;
          display: flex;
          box-sizing: border-box;
          align-items: center;
          justify-content: center;
        }

        :host([window]) .demo {
          width: 60%;
          height: 420px;
          background: #fff;
          margin: 40px auto;
          box-shadow: 0 10px 40px #659BCC;
        }

        .demo_wrapper .actions {
          z-index: 10;
          height: 32px;
          display: flex;
          align-items: center;
          position: absolute;
          bottom: 10px;
          right: 10px;
        }
  
        .actions .action {
          width: 32px;
          height: 32px;
          margin: 0 3px;
          font-size: 10px;
          cursor: pointer;
          font-weight: 500;
          color: #1c323b;
          user-select: none;
          border-radius: 2px;
          background: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-transform: uppercase;
          transition: background-color .15s;
        }
  
        .actions .toggle.on {
          opacity: 1;
        }
  
        .actions .toggle {
          opacity: .5;
          color: #000;
          font-size: 18px;
          line-height: 50px;
          text-align: center;
          transition: opacity .1s;
        }
      </style>
      <div class="demo_wrapper">
        <div class="demo">
          <slot></slot>
        </div>
        <div class="actions">
          <div class="action" id="play">
            <cdmation-icon name="play" size="20"></cdmation-icon>
          </div>
          <div class="action toggle" title="Slow Motion" id="slow">
            <cdmation-icon name="slow" size="20"></cdmation-icon>
          </div>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.playEl = this.shadowRoot.querySelector('#play');
    this.slowEl = this.shadowRoot.querySelector('#slow');
    this.bindPlay = this.bindPlay.bind(this);
    this.bindSlow = this.bindSlow.bind(this);
    this.playEl.addEventListener('click', this.bindPlay);
    this.slowEl.addEventListener('click', this.bindSlow);
  }
  disconnectedCallback() {
    this.playEl.removeEventListener('click', this.bindPlay);
    this.slowEl.removeEventListener('click', this.bindSlow);
  }

  _slow = false;
  bindPlay() {
    this.dispatchEvent(new CustomEvent('play', {
      detail: {
        slow: this._slow,
      }
    }));
  }
  bindSlow() {
    this._slow = !this._slow;
    if (this._slow) this.slowEl.classList.add('on');
    else this.slowEl.classList.remove('on');
    this.bindPlay();
  }
}

if (!customElements.get('cdmation-demo')) {
  customElements.define('cdmation-demo', CdmationDemo);
}
