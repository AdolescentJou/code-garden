import { Component } from 'react';

interface IProps {
  name: string;
  age?: number;
  // sex?: string;
}

type Filter<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]: T[K];
};

class DefaultProps extends Component<Required<IProps>, {}> {
  defaultProps: Required<Filter<IProps>> = {
    age: 20,
  };
  render() {
    const { age } = this.props;
    console.log(age);
    return <div />;
  }
}

// const DefaultProps = (props: IProps) => {
//   const { age = 10, name } = props;

//   console.log(age + 10);

//   return <div />;
// };

// DefaultProps.defaultProps = {
//   age: 20,
// };
// export default DefaultProps;
