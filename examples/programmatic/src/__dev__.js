// Development server only intended to be used by `yarn dev`

import { Server, STATUS_CODES } from "http";
import { parse } from "url";

import cat from "./routes/cat";
import dog from "./routes/dog";
import fox from "./routes/fox";

const server = new Server(async (req, res) => {
  const { pathname } = parse(req.url);

  if (pathname === "/cat") return cat(req, res);
  if (pathname === "/dog") return dog(req, res);
  if (pathname === "/fox") return fox(req, res);

  res.writeHead(404);
  res.end(STATUS_CODES[404]);
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Listening for HTTP requests on port ${port}...`);
});
