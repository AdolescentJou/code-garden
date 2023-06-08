const bindScroll = (dom: any) => {
  const { clientHeight } = dom;
  const { scrollTop } = dom;
  const { scrollHeight } = dom;
  if (clientHeight + scrollTop > scrollHeight - 10) {
    //到底部了
  } else {
    //没有到底部
  }
};

const handleListScroll = (e: any) => {
  const dom = e.target;
  bindScroll(dom);
};
