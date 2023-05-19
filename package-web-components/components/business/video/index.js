import '../../universal/icon/index.js';

export default class ElmationVideo extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        .video_wrap {
          position: relative;
          width: 100%;
          max-width: 800px;
          max-height: 400px;
          background-color: #d3d2d3;
        }

        video {
          width: 100%;
          display: block;
          max-height: 400px;
        }

        .icon_wrap {
          position: absolute;
          top: 0px;
          left: 0px;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.35);
          cursor: pointer;
          opacity: 1;
          transition: opacity 0.3s cubic-bezier(0.215, 0.61, 0.355, 1) 0s;
        }

        .play .icon_wrap {
          opacity: 0;
        }
      </style>
      <div class="video_wrap">
        ${this.src ? `<video src="${this.src}" type="video/mp4" loop></video>` : ''}
        <div class="icon_wrap">
          <svg version="1.2" viewBox="0 0 60 60" width="60" height="60" style="position: absolute; top: 50%; left: 50%; margin: -30px; border-radius: 30px; background-color: rgb(255, 255, 255);">
            <path d="M20 15L20 45L45 30Z" fill="#999" style="transform-origin: 30px 30px; transform: translate(0px, 0px);"></path>
          </svg>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.mainEl = this.shadowRoot.querySelector('.video_wrap');
    this.videoEl = this.shadowRoot.querySelector('video');

    this.isPlaying = false;
    this.videoClick = this.videoClick.bind(this);

    this.mainEl.addEventListener('click', this.videoClick);
  }
  disconnectedCallback() {
    this.videoEl.pause();
    this.mainEl.removeEventListener('click', this.videoClick);
  }

  get src() {
    return this.getAttribute('src');
  }

  videoClick() {
    if (this.videoEl) {
      if (this.isPlaying) {
        this.videoEl.pause();
        this.mainEl.classList.remove('play');
      } else {
        this.videoEl.play();
        this.mainEl.classList.add('play');
      }
      this.isPlaying = !this.isPlaying;
    }
  }
}

if (!customElements.get('elmation-video')) {
  customElements.define('elmation-video', ElmationVideo);
}
