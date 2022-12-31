import React from 'react';
import { AgeContext } from './age-context';

const AgeProvider = (props:any) => {
  // context组件不能写在使用组件内部，必须是其父级之上
  return <AgeContext.Provider value={{age : 22}}>{props.children}</AgeContext.Provider>;
}

export default AgeProvider;
