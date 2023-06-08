// 自动化埋点需求

import { BuriedPointController } from './controller';

// 埋点到客服boss上
class KfbossBuriedPoint extends BuriedPointController {
  //   constructor() {
  //     super();
  //   }
  initApi(api: any) {
    this.api = api;
  }
  send(item: object) {
    console.log('推送数据成果');
    this.api(item)
      .then((res: any) => {
        this.sendEnd();
      })
      .catch((err: any) => {
        this.sendEnd();
      });
  }
}

// 实例化 kfboss的埋点
const kfbossPoint = new KfbossBuriedPoint();

// 设置埋点数据
function kfbossPointSet(item: object) {
  kfbossPoint.setList(item);
}
// 设置埋点接口
function kfbossPointApiSet(api: any) {
  kfbossPoint.initApi(api);
}

// 埋点完成初始化
function kfbossPointInit() {
  kfbossPoint.init();
}

export { kfbossPointApiSet, kfbossPointSet, kfbossPointInit };
