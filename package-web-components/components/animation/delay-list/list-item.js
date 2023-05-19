export default class CdmationDelaylistItem extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          opacity: 0;
          cursor: pointer;
          border-radius: 8px;
          transition: opacity .2s ease-out;
          /** TODO background: linear-gradient(to bottom, transparent 0%, transparent 8.1%, rgba(0,0,0,0.001) 15.5%, rgba(0,0,0,0.003) 22.5%, rgba(0,0,0,0.005) 29%, rgba(0,0,0,0.008) 35.3%, rgba(0,0,0,0.011) 41.2%, rgba(0,0,0,0.014) 47.1%, rgba(0,0,0,0.016) 52.9%, rgba(0,0,0,0.019) 58.8%, rgba(0,0,0,0.022) 64.7%, rgba(0,0,0,0.025) 71%, rgba(0,0,0,0.027) 77.5%, rgba(0,0,0,0.029) 84.5%, rgba(0,0,0,0.03) 91.9%, rgba(0,0,0,0.03) 100%); **/
        }
      </style>
      <slot></slot>
    `;
  }
}

if (!customElements.get('cdmation-delay-list-item')) {
  customElements.define('cdmation-delay-list-item', CdmationDelaylistItem);
}
