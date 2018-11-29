const fetch = require("isomorphic-unfetch");
module.exports = async () => {
  const res = await fetch("https://dog.ceo/api/breeds/image/random");
  const data = await res.json()
  if (data.status !== "success") {
    throw new Error("Unexpected response: " + JSON.stringify(data));
  }
};
