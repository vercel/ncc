function x () {
  console.log('running x');
  throw new Error('xx');
 }
 
 x();