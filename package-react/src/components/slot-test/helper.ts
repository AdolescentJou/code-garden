export const getType = (value: unknown) => {
  if (null === value) {
    return 'null';
  }
  const type = typeof value;
  if ('undefined' === type || 'string' === type) {
    return type;
  }

  const typeString = toString.call(value);
  switch (typeString) {
    case '[object Array]':
      return 'array';
    case '[object Date]':
      return 'date';
    case '[object Boolean]':
      return 'boolean';
    case '[object Number]':
      return 'number';
    case '[object Function]':
      return 'function';
    case '[object RegExp]':
      return 'regexp';
    case '[object Object]':
      return 'object';
    default:
      return 'unknow';
  }
};
