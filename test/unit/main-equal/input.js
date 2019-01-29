require('./dep.js');
// this is the entry main check, so it becomes an outer main check
console.log(require.main === module);
