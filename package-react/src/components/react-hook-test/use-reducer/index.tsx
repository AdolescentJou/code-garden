import { useReducer } from "react";
import { REDUCER_ACTION } from "./action";
import { countReducer, initialState } from "./store";

const TestUseReducer = () => {
  const [state,dispatch] = useReducer(countReducer,initialState)

  return <div>
    <h2>当前数值:{state.count}</h2>
    <button onClick={() => dispatch({type:REDUCER_ACTION.Increase})}>+1</button>
    <button onClick={() => dispatch({type:REDUCER_ACTION.Decrease})}>-1</button>
  </div>
};
export default TestUseReducer;
