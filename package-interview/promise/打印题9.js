async function async1() { 
  console.log("async1 start"); 
  await async2(); 
  console.log("async1 end"); 
} 
async function async2() { 
  console.log("async2"); 
  return Promise.resolve().then(() => { 
      console.log("async2-inner"); 
  }); 
} 

console.log("script start"); 

async1(); 
new Promise(function (resolve) { 
  console.log("promise1"); 
  resolve(); 
}) 
.then(function () { 
  console.log("promise2"); 
}) 
.then(function () { 
  console.log("promise3"); 
}) 
.then(function () { 
  console.log("promise4"); 
}); 
console.log("script end");