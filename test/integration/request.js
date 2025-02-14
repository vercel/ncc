const request = require("request");

(async () => {
  await new Promise((resolve, reject) => {
    request.get("https://example.vercel.sh", { json: false }, (err, resp, body) => {
      if (err) return reject(err);
      if (body.status != "success") {
        return reject(new Error(`Bad status: ${body.status}`));
      }
      resolve(true);
    });
  });
})();