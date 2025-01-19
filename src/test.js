// const promise = new Promise((resolve, reject) => {
//   setTimeout(() => {
//     reject('error');
//   }, 2000);
// });
// let promiseArr;

// (async () => {
//   try {
//     await promise;
//   } catch (err) {
//     console.log(err);
//   }
// })();

// console.log(promiseArr);
// setTimeout(() => {
//   console.log(promiseArr);
// }, 3000);
let myValue = 0;
const myFn = (myValue) => {
  myValue = 10;
  console.log('fn');
};
console.log({ myValue });
myFn();
console.log({ myValue });
