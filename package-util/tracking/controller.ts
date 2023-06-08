class BuriedPointController {
  public pointList: Array<any>;
  public httpState: number;
  public extData: Record<string, any>;
  public api: any;
  constructor() {
    // 埋点待提交栈
    this.pointList = [];
    // 当前推送状态 0 可以推送 1 推送中 2 初始化中
    this.httpState = 2;
    // 初始化为空
    this.extData = {};
  }
  // 初始化 - 可以被子类重写
  init() {
    console.log('初始化成功');
    if (this.httpState === 2) {
      this.httpState = 0;
    }
  }
  // 向后端发送数据 - 需要子类重写
  send(item: object) {}
  // 塞入栈
  setList(item: object) {
    this.pointList.push(item);
    this.controller();
  }
  // 出栈
  getListItem() {
    if (this.pointList.length > 0) {
      return this.pointList.shift();
    }
    return '';
  }
  // 控制器
  controller() {
    if (this.httpState === 0 && this.pointList.length > 0) {
      const item = this.getListItem();
      this.httpState = 1;
      setTimeout(() => {
        this.send(item);
      }, 0);
    }
  }
  // 推送任务完成
  sendEnd() {
    this.httpState = 0;
    this.controller();
  }
  // 设置额外参数
  setExtData(extData:object) {
    this.extData = extData;
  }
}

export { BuriedPointController };
