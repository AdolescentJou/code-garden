function filterCharacter(str){
  // 首先设置一个模式
  let pattern = new RegExp("[`~!@#$^&*()=：”“'。，、？|{}':;'%,\\[\\].<>/?~！@#￥……&*（）&;—|{ }【】‘；]")
  let resultStr = "";
  for (let i = 0; i < str.length; i++) {
      // 主要通过 replace ，pattern 规则 去把字符替换成空 最后拼接在 resultStr
      resultStr = resultStr + str.substr(i, 1).replace(pattern, '');
  }
  // 当循环结束的时候返回最后结果 resultStr
  return resultStr;
}

// 示例
filterCharacter('gyaskjdhy12316789#$%^&!@#1=123,./[') // 结果:gyaskjdhy123167891123