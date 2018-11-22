const Vue = require("vue");
const renderer = require("vue-server-renderer").createRenderer();

module.exports = () => {
  const app = new Vue({
    data: () => ({ date: Date.now() }),
    template: `<div>Hello World {{ date }}</div>`
  });
  renderer.renderToString(app);
};
