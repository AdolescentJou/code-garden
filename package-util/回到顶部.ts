const bindTop = () => {
  // 方法一 这样可以实现，但是效果不太行
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0;
   
 // 方法二 通过计时器去滚动 视觉上会丝滑一些，没有太大的卡顿效果
 const timeTop = setInterval(() => {
   // 去控制他的滑行距离
   document.documentElement.scrollTop = scrollTopH.value -= 50
   // 当滑到顶部的时候记得清除计时器(*) 重点
   if (scrollTopH.value <= 0) {
     clearInterval(timeTop)
   }
 }, 10)
}