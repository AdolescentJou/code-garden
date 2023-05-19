import { Children, cloneElement, createElement, CSSProperties, forwardRef, isValidElement, ReactElement, ReactNode, Ref } from 'react';
import { getType } from './helper';

type ComponentChild = ReactNode;
type ComponentChildren = ComponentChild[] | ComponentChild;

const getNodeName = (node: ComponentChildren, SlotProps: Record<string, any>): [string, ComponentChildren] => {
  // 传的是节点
  if (node && isValidElement(node)) {
    const el: any = node;
    const slotname = el.props.slotname;
    return [slotname, cloneElement(el, { ...el.props, ...SlotProps })];
  }
  // // 传的是准确的Class
  // if (getType(node) === 'object' && Object.prototype.hasOwnProperty.call(node, 'render')) {
  //   const el: any = node.render(SlotProps);
  //   const slotname = el.slotname;
  //   return [slotname, el];
  // }
  // // 传的是Function
  // if (typeof node === 'function') {
  //   const el = node(SlotProps);
  //   const slotname = el.props.slotname;
  //   return [slotname, el];
  // }
  return ['deault', null];
};

// 遍历节点列表，匹配对应节点
const getElement = (list: any[], slotname: string, SlotProps: Record<string, any>) => {
  for (let i = 0; i < list.length; i++) {
    const [key, element] = getNodeName(list[i], SlotProps);
    if (slotname === key) {
      return element;
    }
  }
  return null;
};

// 获取插槽
const getSlot = (children: ComponentChildren | ComponentChildren[], slotname: string, SlotProps: Record<string, any>) => {
  if (!children) {
    return null;
  }
  const childrenArray = Children.toArray(children);
  const element = getElement(childrenArray, slotname, SlotProps);

  if (element && isValidElement(element)) {
    return element;
  }
  return null;
};

const cloneNode = function (props: Record<string, any>, ref: any) {
  const { children, slotname, ...SlotProps } = props;

  if (isValidElement(children as ComponentChildren)) {
    return cloneElement(children, {
      slotname: slotname,
      ...children.props,
      ...SlotProps,
      ref: ref,
    });
  }
  // if (children && typeof children === 'function') {
  //   const node = children({ ...SlotProps, slotname });
  //   return node;
  // }
  return Children.count(children) > 1 ? Children.only(null) : null;
};

const Slot = forwardRef<any, any>((props, forwardedRef) => {
  const { children, slotname, ...SlotProps } = props;
  const slotNewProps = SlotProps;
  let childSlot: any = children;
  childSlot = getSlot(children, slotname, slotNewProps);

  if (isValidElement(childSlot)) {
    return cloneNode(
      {
        children: childSlot,
        slotname,
        ...SlotProps,
      },
      forwardedRef,
    );
  }

  return childSlot;
});

export const VSlot = forwardRef<any, any>((props, forwardedRef) => {
  return cloneNode(props, forwardedRef);
});

export default Slot;
