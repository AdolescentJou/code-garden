import AgeProvider from "./age-provider";
import TestUseConetext from "./test-use-context";

const UseContextContainer = () => {
  return (
    <AgeProvider>
      <TestUseConetext />
    </AgeProvider>
  );
};

export default UseContextContainer;
