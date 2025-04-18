import { get } from "request";

(async () => {
  await new Promise((resolve, reject) => {
    get("https://example.vercel.sh", { json: false }, (err, res) => {
      if (err) return reject(err);
      if (res.statusCode !== 200) {
        return reject(new Error(`Bad status: ${res.statusCode}`));
      }
      resolve(true);
    });
  });
})();
