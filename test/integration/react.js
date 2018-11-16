const React = require("react");
const { renderToString } = require("react-dom/server");

module.exports = () => {
  const html = renderToString(React.createElement("h1"));
  if (html !== '<h1 data-reactroot=""></h1>') {
    throw new Error("Bad react SSR: " + html);
  }
};
