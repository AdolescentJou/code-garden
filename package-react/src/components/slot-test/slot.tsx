import {
  Children,
  cloneElement,
  createElement,
  CSSProperties,
  forwardRef,
  isValidElement,
  ReactElement,
  ReactNode,
  Ref,
} from 'react';
import { getType } from './helper';

type ComponentChild = ReactNode;
type ComponentChildren = ComponentChild[] | ComponentChild;

// 遍历节点列表，匹配对应节点
const getElement = (list: any[], slotname: string, SlotProps: Record<string, any>) => {
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    let [key, element]: [string, ComponentChild] = ['deault', null];
    if (node && isValidElement(node)) {
      const el: any = node;
      const slotname = el.props.slotname;
      [key, element] = [
        slotname,
        cloneElement(el, {
          slotname: slotname,
          ...SlotProps,
        }),
      ];
    }
    if (slotname === key) {
      return element;
    }
  }
  return null;
};

// 获取插槽
const getSlot = (
  children: ComponentChildren | ComponentChildren[],
  slotname: string,
  SlotProps: Record<string, any>,
) => {
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

const Slot = (props: any) => {
  const { children, slotname, ...SlotProps } = props;
  const slotNewProps = SlotProps;
  let childSlot: any = children;
  childSlot = getSlot(children, slotname, slotNewProps);

  return childSlot;
};

export const VSlot = (props: any) => {
  const { children, slotname, ...SlotProps } = props;

  if (isValidElement(children as ComponentChildren)) {
    return cloneElement(children, {
      slotname: slotname,
      ...children.props,
      ...SlotProps,
    });
  }
  return Children.count(children) > 1 ? Children.only(null) : null;
};

export default Slot;
