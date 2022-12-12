//获取元素的宽度
export const getStyleWidth = (el: HTMLDivElement | Element): number => {
  if (!el) {
    return 0;
  }

  const style = window.getComputedStyle(el, null);
  const width = parseInt(style.getPropertyValue('width'), 10);

  return width || el.getBoundingClientRect().width || el.scrollWidth || el.clientWidth;
};

//获取元素的高度
export const getStyleHeight = (el: HTMLDivElement) => {
  if (!el) {
    return 0;
  }
  const style = window.getComputedStyle(el, null);
  const height = parseInt(style.getPropertyValue('height'), 10);
  return height || el.getBoundingClientRect().height || el.scrollHeight || el.clientHeight;
};

//获取其它元素的属性
export const getElementStyle = (el: HTMLElement | Element, name: string) => {
  const style = window.getComputedStyle(el, null);
  return style.getPropertyValue(name);
};
