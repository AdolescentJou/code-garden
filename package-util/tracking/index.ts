/* eslint-disable spaced-comment */
import { config } from './config';
import { kfbossPointSet, kfbossPointInit, kfbossPointApiSet } from './kfbossController';

const trackingConfig = config;

// 劫持对应方法的函数
function trackingFn(component: any, item:any) {
  const { fnName } = item;
  if (component.prototype[fnName]) {
    const bindFn = component.prototype[fnName];
    component.prototype[fnName] = function (...args:any) {
      bindFn.apply(this, args);
      try {
        const point = getPoint(item, this) as any;
        if (point && point.tag_name) {
          kfbossPointSet(point);
        } else {
          console.log(component.name, '-----point_err');
        }
      } catch (e) {
        console.log('trackingFn_err');
      }
    };
  }
}

// 设置对应的埋点数据
function getPoint(item:any, that:any) {
  let point: any = {};
  if (item.extName && that[item.extName]) {
    // 有额外参数，从this中获取埋点数据
    const ert = that[item.extName];
    if (typeof ert === 'string') {
      // 额外埋点数据为字符串
      point.tag_name = ert;
    } else if (typeof ert === 'object') {
      // 额外埋点数据为对象
      point = Object.assign(ert, point);
    }
  }
  if (item.trackEvent) {
    point = Object.assign(item.trackEvent, point);
  }
  // return mergePointObj(point);
}

// 高阶组件：劫持对应的方法
function WithTracking(HocComponent:any) {
  console.log(HocComponent);
  console.log(HocComponent.componentWillMount);
  let name = HocComponent.displayName || HocComponent.name;
  // 名字被重写，获取重新获取出来
  if (name.indexOf('(') >= 0) {
    const start = name.lastIndexOf('(');
    const end = name.indexOf(')');
    name = name.slice(start + 1, end);
  }
  console.log('-------------');
  console.log(name);
  //不存在，不劫持
  if (!trackingConfig[name]) {
    return HocComponent;
  }
  // 已经劫持
  if (trackingConfig[name]['isTracking']) {
    return HocComponent;
  }
  // 劫持对应的点击方法
  if (trackingConfig[name]['eventList']) {
    trackingConfig[name]['eventList'].forEach((item:any) => {
      trackingFn(HocComponent, item);
    });
  }
  return HocComponent;
}

//埋点启动
kfbossPointInit();

export { WithTracking };
