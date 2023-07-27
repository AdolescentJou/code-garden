import 'reflect-metadata';

// 需要开启tsconfig 
// "experimentalDecorators": true,
// "emitDecoratorMetadata": true

//ioc容器
let classPool: Array<Function> = [];

//注册该类进入容器
function Injectable() {
  return (_constructor: Function) => {
    let paramTypes: Array<Function> = Reflect.getMetadata('design:paramtypes', _constructor);
    //已注册
    if (classPool.indexOf(_constructor) != -1) return;
    if (paramTypes) {
      for (let val of paramTypes) {
        if (val === _constructor) throw new Error('不能依赖自己');
        else if (classPool.indexOf(val) == -1) throw new Error(`${val}没有被注册`);
      }
    }
    //注册
    classPool.push(_constructor);
  };
}

//实例化工厂
function classFactory<T>(_constructor: { new (...args: Array<any>): T }): T {
  let paramTypes: Array<Function> = Reflect.getMetadata('design:paramtypes', _constructor);
  //参数实例化
  let paramInstance = paramTypes.map((val: Function) => {
    //依赖的类必须全部进行注册
    if (classPool.indexOf(val) == -1) throw new Error(`${val}没有被注册`);
    //参数还有依赖
    else if (val.length) {
      return classFactory(val as any);
    }
    //没有依赖直接创建实例
    else {
      return new (val as any)();
    }
  });
  return new _constructor(...paramInstance);
}

@Injectable()
class C {
  constructor() {}

  sayHello() {
    console.log('hello');
  }
}

@Injectable()
class B {
  constructor(private c: C) {}

  sayHello() {
    this.c.sayHello();
  }
}

@Injectable()
class A {
  constructor(b: B) {
    b.sayHello();
  }
}

//产生实例
let a: A = classFactory(A); //打印 hello
