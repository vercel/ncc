import fetch from "node-fetch";

export async function animalAPI(res, title, api, key) {
  const resp = await fetch(api);
  const json = await resp.json();

  const body = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
</head>
<body>
  <img src="${json[key]}" alt="${title}" />
</body>
</html>
`;

  res.writeHead(200, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(body);
}
