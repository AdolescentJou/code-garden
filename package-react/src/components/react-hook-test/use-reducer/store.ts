import { REDUCER_ACTION } from './action';

export const initialState = { count: 1 };

export const countReducer = (state: typeof initialState, action: any) => {
  switch (action.type) {
    case REDUCER_ACTION.Increase:
      return { ...state, count: state.count + 1 };
    case REDUCER_ACTION.Decrease:
      return { ...state, count: state.count - 1 };
    default:
      return { ...state };
  }
};
