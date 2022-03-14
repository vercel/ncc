import { get } from "request";

const url = "https://dog.ceo/api/breeds/image/random";

export default () => {
  return new Promise((resolve, reject) => {
    get(url, { json: true }, (err, resp, body) => {
      if (err) return reject(err);
      if (body.status != "success") {
        return reject(new Error("Bad api response: " + JSON.stringify(body)));
      }
      resolve('asdf');
    });
  });
};
