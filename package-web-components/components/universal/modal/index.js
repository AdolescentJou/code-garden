export default class CdmationModal extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        .main {
          position: fixed;
          left: 0;
          top: 0;
          overflow: hidden;
          opacity: 0;
        }
        
        .main_visible {
          width: 100%;
          height: 100%;
          opacity: 1;
          display: flex;
          transition: opacity 0.2s ease;
        }

        .mask {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          cursor: pointer;
        }

        .body {
          opacity: 0;
          flex-grow: 1;
          margin-top: 40px;
          background-color: #fff;
          transform: translateY(15%);
          padding: 64px 24px;
          overflow-y: auto;
        }

        .body_details {
          max-width: 1200px;
          margin: 0 auto;
        }

        .main_visible .body {
          transform: translateY(0);
          transition: opacity 0.2s ease, transform 0.2s ease;
          opacity: 1;
        }
      </style>
      <div class="main ${this.open ? 'main_visible' : ''}">
        <div class="mask"></div>
        <div class="body">
          <div class="body_details">
            <slot></slot>
          </div>
        </div>
      </div>
    `;
  }

  get open() {
    return this.getAttribute('open');
  }

  set open(value) {
    if (value === null || value === false) {
      this.removeAttribute('open');
    } else {
      this.setAttribute('open', 'true');
    }
  }

  connectedCallback() {
    this.mainEl = this.shadowRoot.querySelector('.main');
    this.maskEl = this.shadowRoot.querySelector('.mask');
    this.maskEl.addEventListener('click', () => {
      this.open = false;
    });
    this.bindKeyDown = this.bindKeyDown.bind(this);
    document.addEventListener('keydown', this.bindKeyDown);
  }
  disconnectedCallback() {
    document.addEventListener('keydown', this.bindKeyDown);
  }

  static get observedAttributes() { return ['open'] }
  attributeChangedCallback(name, oldValue, newValue) {
    // 生命周期顺序问题，判断 this.shadowRoot
    if (name === 'open' && this.mainEl) {
      if (newValue === 'true') {
        // 打开面板
        document.body.classList.add('noscroll');
        this.mainEl.classList.add('main_visible');
      } else {
        // 关闭面板
        document.body.classList.remove('noscroll');
        this.mainEl.classList.remove('main_visible');
        // 清空slot
        this.innerHTML = '';
      }
    }
  }

  bindKeyDown(e) {
    // ESC
    if (this.open && e.keyCode === 27) {
      e.stopPropagation();
      this.open = false;
    }
  }
}

if (!customElements.get('cdmation-modal')) {
  customElements.define('cdmation-modal', CdmationModal);
}
