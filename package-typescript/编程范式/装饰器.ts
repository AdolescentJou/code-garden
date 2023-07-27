// 使用 webDecorator 修饰器来修饰 User 类
@webDecorator
export class User {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// 定义一个类修饰器， 只需要定义一个参数
function webDecorator<T extends { new (...args: any[]): {} }>(TargetConstructor: T) {
  return class extends TargetConstructor {
    private registerOrigin = 'WEB-SITE';
  };
}

// 定义一个类修饰器
function appDecorator<T extends { new (...args: any[]): {} }>(TargetConstructor: T) {
  return class extends TargetConstructor {
    private registerOrigin = 'APP';
  };
}
